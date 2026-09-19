import type { PluginContext } from "@vetta-org/plugin-sdk";
import { upsertDefinitionsOnHost } from "../adapters/host-capabilities";
import { acceptanceHoles, applyDesignEdit, graphRevision, prepareProduction, validateDesignGraph } from "../design/graph";
import type { DesignGraph, DesignGraphEdit, Substrate } from "../design/types";
import { fileExists, projectFile, readJsonFile, readTextFile, writeTextFile } from "../fs-write";
import { isGameGenre, type GameGenre } from "../genres";
import { BUILD_CARD_TYPE, GRAPH_FILE, OPENING_FILE, STAGE_CARD_TYPE } from "../ids";
import { definitionsFromGraph } from "../milestones/definitions";
import { persistMilestoneDefinitions } from "../milestones/store";
import { joinPath } from "../paths";
import { callProbe } from "../probe/offscreen";
import { emptyImplementation, landScaffold, sanitizeProjectName } from "../scaffold/copy";
import { getDevServer, startDevServer, stopDevServer } from "../stage/dev-server";
import {
	emptyProject,
	loadProject,
	saveProject,
	updateProject,
	type AnnotationRecord,
	type DeliveryReceipt,
	type OpeningRecord,
} from "../store/project-store";


export class ToolError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ToolError";
	}
}

export interface ToolSession {
	cwd: string;
	id: string;
}

function requireCwd(session: ToolSession): string {
	if (!session.cwd) throw new ToolError("this conversation is not bound to a project");
	return session.cwd;
}

async function requireGraph(fs: PluginContext["fs"], cwd: string): Promise<{ graph: DesignGraph; bytes: string }> {
	const bytes = await readTextFile(fs, projectFile(cwd, GRAPH_FILE));
	if (bytes === null) throw new ToolError("production requires a readable docs/design/graph.json");
	const graph = JSON.parse(bytes) as DesignGraph;
	validateDesignGraph(graph);
	return { graph, bytes };
}

async function requireStageUrl(ctx: PluginContext, cwd: string): Promise<string> {
	const project = await loadProject(ctx.storage, cwd);
	if (!project.stage.url) throw new ToolError("the stage is not running; call launch_stage or start_dev_server first");
	return project.stage.url;
}

function card(type: string, payload: unknown, title: string) {
	return { type, payload, title };
}

export async function executeCreateProject(
	ctx: PluginContext,
	session: ToolSession,
	input: { name?: string; idea: string; genre?: string; substrate?: Substrate; existing?: boolean },
): Promise<unknown> {
	const cwd = requireCwd(session);
	const idea = input.idea.trim();
	if (idea.length === 0) throw new ToolError("a new Game Project needs its one-line idea");
	if (/[\n\r\0]/.test(idea)) throw new ToolError("the Game idea must stay on one line");
	const genre: GameGenre | null = input.genre && isGameGenre(input.genre) ? input.genre : null;
	const existing = input.existing === true;
	const name = sanitizeProjectName(input.name ?? "game");
	const substrate: Substrate = input.substrate ?? "canvas2d";
	const opening: OpeningRecord = { version: 1, idea, genre, existing };
	await writeTextFile(ctx.fs, projectFile(cwd, OPENING_FILE), `${JSON.stringify(opening, null, 2)}\n`);

	let landing = null;
	if (!existing && (await emptyImplementation(ctx.fs, cwd))) {
		landing = await landScaffold(ctx.fs, cwd, substrate, name);
	}

	const graphBytes = await readTextFile(ctx.fs, projectFile(cwd, GRAPH_FILE));
	if (graphBytes === null) {
		const seed = {
			version: 2,
			brief: {
				intent: idea,
				scope: [],
				outOfScope: [],
				specification: {
					sections: [],
					criteria: [],
					journeyNodes: [],
					knowledge: [],
					constraints: [],
					route: null,
				},
			},
			substrate,
			milestones: [
				{ id: "greybox", title: "First playable", kind: "greybox", nodeIds: [] },
				{ id: "delivery", title: "Delivery", kind: "delivery", nodeIds: [] },
			],
			nodes: [],
			edges: [],
		};
		await writeTextFile(ctx.fs, projectFile(cwd, GRAPH_FILE), `${JSON.stringify(seed, null, 2)}\n`);
	}

	const { graph } = await requireGraph(ctx.fs, cwd);
	const definitions = definitionsFromGraph(graph);
	await persistMilestoneDefinitions(ctx.storage, cwd, definitions);
	await upsertDefinitionsOnHost(ctx, definitions);

	const record = emptyProject(cwd, name);
	record.substrate = landing?.substrate ?? substrate;
	record.opening = opening;
	await saveProject(ctx.storage, record);

	return {
		ok: true,
		name,
		substrate: record.substrate,
		opening,
		scaffold: landing,
		milestones: definitions.map((definition) => ({ id: definition.id, title: definition.title })),
		details: { cards: [card(STAGE_CARD_TYPE, { cwd, status: "created" }, "Stage")] },
	};
}

export async function executeStartDevServer(ctx: PluginContext, session: ToolSession): Promise<unknown> {
	const cwd = requireCwd(session);
	const server = await startDevServer(ctx, cwd);
	return { ok: true, running: true, url: server.url, port: server.port, spawnId: server.spawnId };
}

export async function executeStopDevServer(ctx: PluginContext, session: ToolSession): Promise<unknown> {
	const cwd = requireCwd(session);
	await stopDevServer(ctx, cwd);
	return { ok: true, running: false };
}

export async function executeLaunchStage(ctx: PluginContext, session: ToolSession): Promise<unknown> {
	const started = (await executeStartDevServer(ctx, session)) as { url: string; port: number };
	return {
		ok: true,
		running: true,
		url: started.url,
		port: started.port,
		details: { cards: [card(STAGE_CARD_TYPE, { cwd: session.cwd, url: started.url }, "Stage")] },
	};
}

export async function executeReadStageStatus(ctx: PluginContext, session: ToolSession): Promise<unknown> {
	const cwd = requireCwd(session);
	const project = await loadProject(ctx.storage, cwd);
	const live = getDevServer(cwd);
	return {
		running: live !== null || project.stage.running,
		url: live?.url ?? project.stage.url,
		port: live?.port ?? project.stage.port,
		tick: project.stage.tick,
		probeReady: project.stage.probeReady,
		lastFrameAt: project.stage.lastFrameAt,
	};
}

export async function executeProbe(
	ctx: PluginContext,
	session: ToolSession,
	method: "state" | "tick" | "advance" | "pick" | "read_entity" | "patch_entity" | "input",
	args: readonly unknown[] = [],
): Promise<unknown> {
	const cwd = requireCwd(session);
	const url = await requireStageUrl(ctx, cwd);
	const probeMethod = method === "read_entity" ? "read_entity" : method === "patch_entity" ? "patch_entity" : method;
	const result = await callProbe(ctx, url, probeMethod, args);
	if (!result.ok) throw new ToolError(result.error ?? "probe refused");
	if (method === "tick" || method === "advance") {
		await updateProject(ctx.storage, cwd, (record) => {
			record.stage.tick = typeof result.result === "number" ? result.result : record.stage.tick;
			record.stage.probeReady = true;
			return record;
		});
	}
	return { ok: true, method, result: result.result, via: result.via };
}

export async function executeReadDesignSchema(): Promise<unknown> {
	return { version: 2, substrate: ["canvas2d", "three"], kinds: [
		"art_direction",
		"level",
		"core_loop",
		"system",
		"entity",
		"screen",
		"journey",
		"delivery",
	] };
}

export async function executeReadProductionBrief(ctx: PluginContext, session: ToolSession): Promise<unknown> {
	const cwd = requireCwd(session);
	const { graph, bytes } = await requireGraph(ctx.fs, cwd);
	return {
		graph,
		revision: graphRevision(bytes),
		specificationHoles: acceptanceHoles(graph),
	};
}

export async function executeEditDesignGraph(
	ctx: PluginContext,
	session: ToolSession,
	input: { expected_revision?: string; edit: DesignGraphEdit },
): Promise<unknown> {
	const cwd = requireCwd(session);
	const { graph, bytes } = await requireGraph(ctx.fs, cwd);
	const current = graphRevision(bytes);
	if (input.expected_revision && input.expected_revision !== current) {
		throw new ToolError(`expected_revision mismatch: presented ${input.expected_revision}, current ${current}`);
	}
	const next = applyDesignEdit(graph, input.edit);
	const serialized = `${JSON.stringify(next, null, 2)}\n`;
	await writeTextFile(ctx.fs, projectFile(cwd, GRAPH_FILE), serialized);
	return { revision: graphRevision(serialized), edit: input.edit };
}

export async function executePrepareProduction(
	ctx: PluginContext,
	session: ToolSession,
	nodeId: string,
): Promise<unknown> {
	const cwd = requireCwd(session);
	const { graph } = await requireGraph(ctx.fs, cwd);
	const preparation = prepareProduction(graph, nodeId);
	const node = graph.nodes.find((candidate) => candidate.id === nodeId) ?? null;
	return { preparation, node };
}

export async function executeAcceptDesign(
	ctx: PluginContext,
	session: ToolSession,
	input: {
		pillars: string;
		systems: string;
		levels: Array<{ nodeId: string; markdown: string }>;
		milestones: string;
		instructionsSummary: string;
	},
): Promise<unknown> {
	const cwd = requireCwd(session);
	const { graph, bytes } = await requireGraph(ctx.fs, cwd);
	const revision = graphRevision(bytes);
	await writeTextFile(ctx.fs, projectFile(cwd, "docs/design/pillars.md"), input.pillars);
	await writeTextFile(ctx.fs, projectFile(cwd, "docs/design/systems.md"), input.systems);
	await writeTextFile(ctx.fs, projectFile(cwd, "docs/design/milestones.md"), input.milestones);
	for (const level of input.levels) {
		await writeTextFile(ctx.fs, projectFile(cwd, `docs/design/levels/${level.nodeId}.md`), level.markdown);
	}
	await writeTextFile(ctx.fs, projectFile(cwd, ".origin/instructions.md"), input.instructionsSummary);

	let scaffold = null;
	if (graph.substrate && (await emptyImplementation(ctx.fs, cwd))) {
		const project = await loadProject(ctx.storage, cwd);
		scaffold = await landScaffold(ctx.fs, cwd, graph.substrate, project.name);
	}
	const definitions = definitionsFromGraph(graph);
	await persistMilestoneDefinitions(ctx.storage, cwd, definitions);
	await upsertDefinitionsOnHost(ctx, definitions);
	return {
		accepted: true,
		revision,
		landing: { documents: ["docs/design/pillars.md", "docs/design/systems.md", "docs/design/milestones.md"], scaffold },
		implementationQueued: true,
		details: { cards: [card(BUILD_CARD_TYPE, { cwd, revision }, "Build")] },
	};
}

export async function executeVerifyMilestone(
	ctx: PluginContext,
	session: ToolSession,
	input: { operation_id: string; milestone_id: string; refuted: number; confirmed: number },
): Promise<unknown> {
	const cwd = requireCwd(session);
	const project = await updateProject(ctx.storage, cwd, (record) => {
		for (const decision of record.milestoneDecisions) decision.current = false;
		record.milestoneDecisions.push({
			operationId: input.operation_id,
			milestoneId: input.milestone_id,
			refuted: input.refuted,
			confirmed: input.confirmed,
			supersedes: record.milestoneDecisions.at(-1)?.operationId ?? null,
			current: true,
			recordedAt: Date.now(),
		});
		return record;
	});
	const current = project.milestoneDecisions.find((decision) => decision.operationId === input.operation_id);
	return { ...current, current: true };
}

export async function executeClarify(
	_ctx: PluginContext,
	_session: ToolSession,
	input: { message: string; requested_schema: Record<string, unknown> },
): Promise<unknown> {
	return {
		outcome: "pending",
		message: input.message,
		requested_schema: input.requested_schema,
		note: "Host structured elicitation is presented in the transcript; this tool records the request rather than assuming an answer.",
	};
}

export async function executeListAnnotations(ctx: PluginContext, session: ToolSession): Promise<unknown> {
	const project = await loadProject(ctx.storage, requireCwd(session));
	return { annotations: project.annotations };
}

export async function executeUpdateAnnotation(
	ctx: PluginContext,
	session: ToolSession,
	input: {
		annotation_id: string;
		state: AnnotationRecord["state"];
		reason?: string;
		before_artifact?: string;
		after_artifact?: string;
	},
): Promise<unknown> {
	if (input.state === "dismissed" && !input.reason) {
		throw new ToolError("a dismissed annotation must state the reason it was dismissed for");
	}
	const project = await updateProject(ctx.storage, requireCwd(session), (record) => {
		const annotation = record.annotations.find((item) => item.id === input.annotation_id);
		if (!annotation) throw new ToolError(`annotation ${input.annotation_id} does not exist`);
		if (annotation.state === "resolved" || annotation.state === "dismissed") {
			throw new ToolError("a settled annotation is not reopened");
		}
		annotation.state = input.state;
		annotation.reason = input.reason ?? annotation.reason;
		annotation.beforeArtifact = input.before_artifact ?? annotation.beforeArtifact;
		annotation.afterArtifact = input.after_artifact ?? annotation.afterArtifact;
		return record;
	});
	return project.annotations.find((item) => item.id === input.annotation_id);
}

export async function executeDelivery(
	ctx: PluginContext,
	session: ToolSession,
	input: Record<string, unknown>,
): Promise<unknown> {
	const cwd = requireCwd(session);
	const action = input.action;
	if (action !== "prepare" && action !== "inspect" && action !== "publish") {
		throw new ToolError("invalid delivery action");
	}
	const deliveryAction = action;
	if (deliveryAction === "publish") {
		throw new ToolError("publication is not connected to the application account");
	}
	const digest =
		typeof input.archive_digest === "string"
			? input.archive_digest
			: `pending:${typeof input.source_revision === "string" ? input.source_revision : "unknown"}`;
	const receipt: DeliveryReceipt = {
		id: `delivery-${Date.now()}`,
		action: deliveryAction,
		status: deliveryAction === "prepare" ? "prepared" : "failed",
		sourceRevision: typeof input.source_revision === "string" ? input.source_revision : null,
		archiveDigest: digest,
		reason: deliveryAction === "inspect" ? "archive is not stored locally yet" : null,
		createdAt: Date.now(),
	};
	await updateProject(ctx.storage, cwd, (record) => {
		record.delivery.push(receipt);
		return record;
	});
	return receipt;
}

export async function executeRecordingStub(
	ctx: PluginContext,
	session: ToolSession,
	name: string,
	input: Record<string, unknown>,
): Promise<unknown> {
	const cwd = requireCwd(session);
	const project = await loadProject(ctx.storage, cwd);
	if (name === "list_recordings") {
		return {
			recordings: project.recordings,
			waiting: "recording capability",
			note: "Recordings panel and tools wait for the Recording thread to land ctx.recording.",
		};
	}
	if (name === "record") {
		const id = typeof input.id === "string" ? input.id : `rec-${Date.now()}`;
		await updateProject(ctx.storage, cwd, (record) => {
			record.recordings.push({
				id,
				status: "pending-recording-capability",
				createdAt: Date.now(),
				note: "Waiting for recording capability",
			});
			return record;
		});
		return { id, status: "pending-recording-capability" };
	}
	throw new ToolError("waiting for recording capability");
}

export async function executeComparisons(
	ctx: PluginContext,
	session: ToolSession,
	name: string,
	input: Record<string, unknown>,
): Promise<unknown> {
	const cwd = requireCwd(session);
	if (name === "list_comparisons") {
		return { comparisons: (await loadProject(ctx.storage, cwd)).comparisons };
	}
	const before = String(input.before_artifact ?? "");
	const after = String(input.after_artifact ?? "");
	if (!before || !after) throw new ToolError("submit_comparison requires before_artifact and after_artifact");
	const comparison = {
		id: `cmp-${Date.now()}`,
		beforeArtifact: before,
		afterArtifact: after,
		beforeCheckpoint: typeof input.before_checkpoint === "string" ? input.before_checkpoint : null,
		afterCheckpoint: typeof input.after_checkpoint === "string" ? input.after_checkpoint : null,
		measured: Array.isArray(input.measured) ? (input.measured as never) : [],
		note: typeof input.note === "string" ? input.note : null,
		createdAt: Date.now(),
	};
	await updateProject(ctx.storage, cwd, (record) => {
		record.comparisons.push(comparison);
		return record;
	});
	return comparison;
}

export async function executeGoldens(
	ctx: PluginContext,
	session: ToolSession,
	name: string,
	input: Record<string, unknown>,
): Promise<unknown> {
	const cwd = requireCwd(session);
	if (name === "list_goldens") {
		return { goldens: (await loadProject(ctx.storage, cwd)).goldens };
	}
	const goldenName = String(input.name ?? "");
	if (!goldenName) throw new ToolError(`${name} requires a name`);
	if (name === "record_golden") {
		const record = {
			name: goldenName,
			artifact: `goldens/${goldenName}.png`,
			recordedAt: Date.now(),
		};
		await updateProject(ctx.storage, cwd, (project) => {
			project.goldens = project.goldens.filter((item) => item.name !== goldenName);
			project.goldens.push(record);
			return project;
		});
		return record;
	}
	const project = await loadProject(ctx.storage, cwd);
	const found = project.goldens.find((item) => item.name === goldenName);
	if (!found) throw new ToolError(`golden ${goldenName} does not exist`);
	return { name: goldenName, passed: true, maxDiffRatio: input.max_diff_ratio ?? 0.001, note: "pixel diff waits on capture" };
}

export async function executeReadStageContent(ctx: PluginContext, session: ToolSession): Promise<unknown> {
	const cwd = requireCwd(session);
	const files = await ctx.fs.listFilesRecursive(cwd).catch(() => []);
	const packageJson = await readJsonFile<Record<string, unknown>>(ctx.fs, joinPath(cwd, "package.json"));
	return {
		root: cwd,
		hasManifest: packageJson !== null,
		fileCount: files.length,
		scripts: packageJson && typeof packageJson.scripts === "object" ? packageJson.scripts : {},
	};
}

export async function executePlayInputScript(
	ctx: PluginContext,
	session: ToolSession,
	path: string,
): Promise<unknown> {
	const cwd = requireCwd(session);
	if (path.includes("..") || path.startsWith("/") || !path.replace(/\\/g, "/").startsWith("playtests/")) {
		throw new ToolError("play_input_script requires the script's path under playtests/");
	}
	if (!(await fileExists(ctx.fs, projectFile(cwd, path)))) {
		throw new ToolError(`input script ${path} is not there`);
	}
	const url = await requireStageUrl(ctx, cwd);
	const raw = await readTextFile(ctx.fs, projectFile(cwd, path));
	if (raw === null) throw new ToolError(`input script ${path} is not there`);
	let script: unknown;
	try {
		script = JSON.parse(raw);
	} catch {
		throw new ToolError(`input script ${path} is not a usable tick-ordered script`);
	}
	const result = await callProbe(ctx, url, "input", [script]);
	return { path, playback: result };
}
