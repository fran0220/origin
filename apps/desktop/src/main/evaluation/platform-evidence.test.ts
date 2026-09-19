import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutionReceipt, MainlineCheckpoint } from "@origin/runtime-checkpoints";
import { EvaluationService } from "@origin/runtime-evaluation";
import { FileCheckpointStore } from "@origin/runtime-node/checkpoints";
import { createNodeVerifierRunner, FileEvaluationStore, sha256Text } from "@origin/runtime-node/evaluation";
import { FileRecordingStore } from "@origin/runtime-node/recording";
import type { RecordingRecord } from "@origin/runtime-recording";
import { afterEach, describe, expect, it } from "vitest";
import { createPlatformEvaluationEvidenceProvider } from "./platform-evidence.js";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "origin-evaluation-evidence-"));
	roots.push(root);
	const checkpoints = new FileCheckpointStore({ checkpointRoot: join(root, "checkpoints") });
	const recordingRoot = join(root, "recordings");
	const recordings = new FileRecordingStore({ rootDirectory: recordingRoot });
	const evidenceProvider = createPlatformEvaluationEvidenceProvider({
		checkpoints: () => checkpoints,
		recordingRoot: () => recordingRoot,
		resolveProject: async (scope) =>
			scope === "project:project-a"
				? { checkpointProjectKeys: ["legacy-a"], recordingProjectKeys: ["project-a", "old-game-a"] }
				: scope === "global"
					? { checkpointProjectKeys: ["home"], recordingProjectKeys: ["home"] }
					: undefined,
	});
	const service = new EvaluationService({
		store: new FileEvaluationStore({ rootDir: join(root, "evaluation") }),
		evidenceProvider,
		verifierRunner: createNodeVerifierRunner(),
	});
	return { root, checkpoints, recordingRoot, recordings, evidenceProvider, service };
}

function receipt(id: string, turnId = "turn-a", sessionId = "session-a"): ExecutionReceipt {
	return {
		recordType: "checkpoint.execution-receipt",
		schemaVersion: 1,
		executionId: id,
		sessionId,
		turnId,
		command: "bun run build",
		cwd: "/project/a",
		startedAt: 1_000,
		endedAt: 2_000,
		outcome: { kind: "exited", code: 0 },
	};
}

function checkpoint(id: string, projectKey = "legacy-a", turnId = "turn-a"): MainlineCheckpoint {
	return {
		recordType: "checkpoint.mainline",
		schemaVersion: 1,
		id,
		projectKey,
		turnId,
		operationId: `operation-${id}`,
		sessionId: "session-a",
		intent: "build game",
		createdAt: 3_000,
		updatedAt: 3_000,
		verification: [],
		phase: "settled",
		decision: "kept",
	};
}

async function recording(store: FileRecordingStore, id: string, projectKey: string, endedAt = 2_500) {
	const record: RecordingRecord = {
		recordType: "recording.record",
		schemaVersion: 1,
		id,
		projectKey,
		sessionId: "session-a",
		startedAt: 1_500,
		endedAt,
		audio: "none",
		frames: [],
		telemetryPath: "telemetry.jsonl",
		inputPath: "input.jsonl",
		retention: "until-cleared",
		status: "ready",
	};
	await store.put(record);
	await writeFile(join(store.directoryFor(record), "telemetry.jsonl"), '{"atMs":1,"kind":"tick","payload":7}\n');
	return record;
}

describe("platform evaluation evidence", () => {
	it("evaluates captured legacy-project JSONL and keeps historical outcomes when telemetry changes", async () => {
		const { recordings, service } = await fixture();
		const record = await recording(recordings, "rec-greybox", "old-game-a");
		const telemetryPath = join(recordings.directoryFor(record), "telemetry.jsonl");
		const scope = { kind: "project", projectKey: "project-a" } as const;
		await service.upsertDefinition(scope, {
			id: "greybox",
			title: "Greybox playback",
			criteria: [
				{
					id: "playback",
					title: "Input dispatched and tick advanced",
					required: true,
					verifier: {
						kind: "assertion",
						source: "recording-telemetry",
						expression: JSON.stringify({
							all: [
								{ path: "playback.refused", op: "eq", value: 0 },
								{ path: "playback.dispatched", op: "gt", value: 0 },
								{ path: "afterTick", op: "gt", other: "beforeTick" },
							],
						}),
					},
				},
			],
		});
		const run = () => service.run({ scope, definitionId: "greybox", trigger: { kind: "milestone", ref: "greybox" } });
		const lines = (accepted: boolean) =>
			[
				{ atMs: 0, kind: "tick", payload: { ok: true, result: 7 } },
				{ atMs: 1, kind: "input", payload: { ok: true, result: accepted } },
				{ atMs: 2, kind: "advance", payload: { ok: true, result: 11 } },
			]
				.map((line) => JSON.stringify(line))
				.join("\n");
		await writeFile(telemetryPath, lines(true));
		const passed = await run();
		expect(passed.outcome.kind).toBe("passed");
		await writeFile(telemetryPath, lines(false));
		const failed = await run();
		expect(failed.outcome.kind).toBe("failed");
		await writeFile(telemetryPath, '{"atMs":0,"kind":"state","payload":{"dispatched":1,"refused":0}}\n');
		const missing = await run();
		expect(missing.outcome.kind).toBe("inconclusive");
		expect(new Set([passed.id, failed.id, missing.id]).size).toBe(3);
		const historical = await service.get(scope, passed.id);
		expect(historical.attempt.outcome.kind).toBe("passed");
		expect(historical.evidence[0]?.digest).toBe(sha256Text(lines(true)));
		const newer = await recording(recordings, "rec-newer", "project-a", 5_000);
		await writeFile(join(recordings.directoryFor(newer), "telemetry.jsonl"), lines(true));
		expect((await run()).outcome.kind).toBe("inconclusive");
		expect(
			(await service.run({ scope, definitionId: "greybox", trigger: { kind: "manual", ref: newer.id } })).outcome
				.kind,
		).toBe("passed");
	});

	it("persists real receipt, checkpoint and recording evidence through the evaluation entry point", async () => {
		const { checkpoints, recordings, service } = await fixture();
		await checkpoints.appendReceipt("legacy-a", receipt("execution-a"));
		await checkpoints.append(checkpoint("checkpoint-a"));
		await recording(recordings, "rec-a", "old-game-a");
		await checkpoints.appendReceipt("legacy-b", receipt("execution-b"));
		await recording(recordings, "rec-b", "project-b", 9_000);
		const scope = { kind: "project", projectKey: "project-a" } as const;
		await service.upsertDefinition(scope, {
			id: "milestone",
			title: "Game milestone",
			criteria: [{ id: "play", title: "Gameplay", required: true }],
		});
		const attempt = await service.run({
			scope,
			definitionId: "milestone",
			trigger: { kind: "milestone", ref: "greybox" },
		});
		const view = await service.get(scope, attempt.id);
		expect(view.evidence.map((item) => item.source.kind).sort()).toEqual([
			"checkpoint",
			"execution-receipt",
			"recording",
		]);
		expect(view.evidence.find((item) => item.source.kind === "execution-receipt")?.capturedAt).toBe(
			"1970-01-01T00:00:02.000Z",
		);
		expect(view.evidence.find((item) => item.source.kind === "recording")).toMatchObject({
			source: { recordingId: "rec-a", projectKey: "old-game-a" },
			digest: sha256Text('{"atMs":1,"kind":"tick","payload":7}\n'),
		});
		expect(JSON.stringify(view.evidence)).not.toContain("execution-b");
		expect(attempt.outcome.kind).toBe("inconclusive");
	});

	it("keeps earlier attempt evidence intact when the same checkpoint changes state", async () => {
		const { checkpoints, service } = await fixture();
		const initial = checkpoint("checkpoint-a");
		await checkpoints.append(initial);
		const scope = { kind: "project", projectKey: "project-a" } as const;
		await service.upsertDefinition(scope, {
			id: "milestone",
			title: "Game milestone",
			criteria: [{ id: "play", title: "Gameplay", required: true }],
		});
		const input = { scope, definitionId: "milestone", trigger: { kind: "checkpoint", ref: initial.id } } as const;
		const before = await service.run(input);
		await checkpoints.replace({ ...initial, decision: "reverted", updatedAt: 4_000 });
		const after = await service.run(input);
		expect(after.id).not.toBe(before.id);
		expect((await service.get(scope, before.id)).evidence[0]?.summary).toBe("checkpoint settled kept");
		expect((await service.get(scope, after.id)).evidence[0]?.summary).toBe("checkpoint settled reverted");
	});

	it("attaches only a recording in the checkpoint session and receipt time interval", async () => {
		const { checkpoints, recordings, evidenceProvider } = await fixture();
		await checkpoints.appendReceipt("legacy-a", receipt("execution-a"));
		await checkpoints.append(checkpoint("checkpoint-a"));
		await recording(recordings, "rec-in-turn", "project-a");
		const later = await recording(recordings, "rec-later", "project-a", 5_000);
		await recordings.put({ ...later, startedAt: 3_500 });
		const otherSession = await recording(recordings, "rec-other-session", "project-a", 2_900);
		await recordings.put({ ...otherSession, sessionId: "session-b" });
		const captured = await evidenceProvider.capture("project:project-a", { kind: "checkpoint", ref: "checkpoint-a" });
		expect(captured.evidence.filter((item) => item.source.kind === "recording").map((item) => item.source)).toEqual([
			expect.objectContaining({ recordingId: "rec-in-turn" }),
		]);
	});

	it("isolates home and unknown scopes and does not substitute another turn for a missing checkpoint", async () => {
		const { checkpoints, recordings, evidenceProvider } = await fixture();
		await checkpoints.appendReceipt("legacy-a", receipt("execution-a"));
		await checkpoints.append(checkpoint("checkpoint-a"));
		await checkpoints.appendReceipt("home", receipt("home-execution"));
		await recording(recordings, "rec-a", "project-a");
		expect((await evidenceProvider.capture("project:unknown", { kind: "manual" })).evidence).toEqual([]);
		const home = await evidenceProvider.capture("global", { kind: "manual" });
		expect(home.evidence.map((item) => item.source.kind)).toEqual(["execution-receipt"]);
		expect(
			(await evidenceProvider.capture("project:project-a", { kind: "checkpoint", ref: "missing" })).evidence,
		).toEqual([]);
		expect(
			(await evidenceProvider.capture("project:project-a", { kind: "turn", ref: "other-turn" })).evidence,
		).toEqual([]);
	});

	it("selects the requested recording, skips active/expired videos and changes identity with telemetry content", async () => {
		const { recordings, evidenceProvider } = await fixture();
		const first = await recording(recordings, "rec-first", "project-a");
		const newer = await recording(recordings, "rec-newer", "project-a", 4_000);
		await recordings.put({ ...newer, status: "recording" });
		const expired = await recording(recordings, "rec-expired", "project-a", 5_000);
		await recordings.put({ ...expired, retention: "30m", expiresAt: 6_000 });
		const before = await evidenceProvider.capture("project:project-a", { kind: "manual" });
		expect(before.evidence).toHaveLength(1);
		expect(before.evidence[0]?.source).toMatchObject({ recordingId: "rec-first" });
		await writeFile(
			join(recordings.directoryFor(first), "telemetry.jsonl"),
			'{"atMs":1,"kind":"tick","payload":8}\n',
		);
		const after = await evidenceProvider.capture("project:project-a", { kind: "manual", ref: "rec-first" });
		expect(after.evidence[0]?.id).not.toBe(before.evidence[0]?.id);
		expect(
			(await evidenceProvider.capture("project:project-a", { kind: "manual", ref: "rec-missing" })).evidence,
		).toEqual(after.evidence);
	});

	it("rejects telemetry paths escaping the recording directory", async () => {
		const { root, recordings, evidenceProvider } = await fixture();
		const record = await recording(recordings, "rec-a", "project-a");
		await mkdir(join(root, "private"));
		await writeFile(join(root, "private", "data"), "not telemetry");
		await recordings.put({ ...record, telemetryPath: join(root, "private", "data") });
		await expect(evidenceProvider.capture("project:project-a", { kind: "manual" })).rejects.toThrow("outside");
	});
});
