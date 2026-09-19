import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvaluationService, InMemoryEvaluationStore } from "@vetta/runtime-evaluation";
import { afterEach, describe, expect, it } from "vitest";
import { sha256Text } from "./digest.js";
import { createNodeVerifierRunner } from "./verifier-runner.js";

const scope = { kind: "project" as const, projectKey: "demo" };

describe("Node command verifier", () => {
	const directories: string[] = [];

	afterEach(async () => {
		for (const directory of directories.splice(0)) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("runs a command verifier in a temporary directory and settles from the receipt", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "evaluation-verifier-"));
		directories.push(cwd);
		await writeFile(join(cwd, "ok.txt"), "ok\n", "utf8");
		const store = new InMemoryEvaluationStore();
		const service = new EvaluationService({
			store,
			evidenceProvider: { kind: "none", capture: async () => ({ evidence: [] }) },
			verifierRunner: createNodeVerifierRunner({ defaultCwd: cwd }),
		});
		const definition = await service.upsertDefinition(scope, {
			title: "File exists",
			criteria: [
				{
					title: "ok.txt is present",
					required: true,
					verifier: { kind: "command", command: "test", args: ["-f", "ok.txt"], cwd },
				},
			],
		});
		const passed = await service.run({ scope, definitionId: definition.id, trigger: { kind: "manual" } });
		expect(passed.outcome.kind).toBe("passed");
		expect(passed.findings[0]?.state).toBe("passed");
		expect(passed.evidenceIds).toHaveLength(1);
		const view = await service.get(scope, passed.id);
		expect(view.evidence[0]?.source.kind).toBe("execution-receipt");

		const failing = await service.upsertDefinition(scope, {
			title: "Missing file",
			criteria: [
				{
					title: "missing.txt is present",
					required: true,
					verifier: { kind: "command", command: "test", args: ["-f", "missing.txt"], cwd },
				},
			],
		});
		const failed = await service.run({ scope, definitionId: failing.id, trigger: { kind: "manual" } });
		expect(failed.outcome.kind).toBe("failed");
		expect(failed.findings[0]?.evidenceIds.length).toBe(1);
	});
});

const PLAYBACK =
	'{"all":[{"path":"playback.refused","op":"eq","value":0},{"path":"playback.dispatched","op":"gt","value":0}]}';
const TICK = '{"path":"afterTick","op":"gt","other":"beforeTick"}';

const passingTelemetry = [
	`{"atMs":0,"kind":"tick","payload":{"ok":true,"result":10,"request":null}}`,
	`{"atMs":16,"kind":"input","payload":{"ok":true,"result":true,"request":{"kind":"key","key":"Space"}}}`,
	`{"atMs":32,"kind":"advance","payload":{"ok":true,"result":12,"request":1}}`,
	"",
].join("\n");

describe("Node recording-telemetry assertion verifier", () => {
	const directories: string[] = [];

	afterEach(async () => {
		for (const directory of directories.splice(0)) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	async function telemetryFile(text: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "evaluation-telemetry-"));
		directories.push(directory);
		const path = join(directory, "telemetry.jsonl");
		await writeFile(path, text, "utf8");
		return path;
	}

	function recordingEvidence(
		path: string,
		options: {
			readonly id?: string;
			readonly recordingId?: string;
			readonly digest?: string;
			readonly projectKey?: string;
		} = {},
	) {
		const recordingId = options.recordingId ?? "rec_greybox";
		const digest = options.digest ?? sha256Text(passingTelemetry);
		return {
			id: options.id ?? `recording:${recordingId}:${digest}`,
			source: {
				kind: "recording" as const,
				recordingId,
				projectKey: options.projectKey ?? "demo",
				telemetryPath: path,
			},
			capturedAt: "2026-01-01T00:00:00.000Z",
			digest,
			summary: "recording ready",
		};
	}

	async function runAssertion(options: {
		readonly expression: string;
		readonly telemetry: string;
		readonly extraEvidence?: ReturnType<typeof recordingEvidence>[];
		readonly trigger?: { readonly kind: "manual" | "milestone"; readonly ref?: string };
		readonly digest?: string;
		readonly recordingId?: string;
		readonly projectKey?: string;
		readonly evidence?: ReturnType<typeof recordingEvidence>[];
	}) {
		const path = await telemetryFile(options.telemetry);
		const evidence =
			options.evidence ??
			recordingEvidence(path, {
				digest: options.digest ?? sha256Text(options.telemetry),
				recordingId: options.recordingId,
				projectKey: options.projectKey,
			});
		const captured = Array.isArray(evidence) ? evidence : [evidence, ...(options.extraEvidence ?? [])];
		const store = new InMemoryEvaluationStore();
		const service = new EvaluationService({
			store,
			evidenceProvider: {
				kind: "recording",
				capture: async () => ({ evidence: captured }),
			},
			verifierRunner: createNodeVerifierRunner(),
		});
		const definition = await service.upsertDefinition(scope, {
			title: "Greybox probe",
			criteria: [
				{
					title: "telemetry assertion",
					required: true,
					verifier: { kind: "assertion", source: "recording-telemetry", expression: options.expression },
				},
			],
		});
		return service.run({
			scope,
			definitionId: definition.id,
			trigger: options.trigger ?? { kind: "manual" },
		});
	}

	it("passes the greybox input and tick expressions against captured telemetry JSONL", async () => {
		const playback = await runAssertion({ expression: PLAYBACK, telemetry: passingTelemetry });
		expect(playback.outcome.kind).toBe("passed");
		expect(playback.findings[0]?.state).toBe("passed");
		expect(playback.findings[0]?.evidenceIds).toHaveLength(1);

		const ticks = await runAssertion({ expression: TICK, telemetry: passingTelemetry });
		expect(ticks.findings[0]?.state).toBe("passed");
	});

	it("fails when player input was refused", async () => {
		const refused = [
			`{"atMs":0,"kind":"tick","payload":{"ok":true,"result":1,"request":null}}`,
			`{"atMs":8,"kind":"input","payload":{"ok":true,"result":false,"request":{"kind":"key"}}}`,
			`{"atMs":16,"kind":"advance","payload":{"ok":true,"result":2,"request":1}}`,
			"",
		].join("\n");
		const attempt = await runAssertion({ expression: PLAYBACK, telemetry: refused });
		expect(attempt.outcome.kind).toBe("failed");
		expect(attempt.findings[0]?.state).toBe("failed");
	});

	it("is inconclusive when telemetry is empty or the projected paths are missing", async () => {
		const empty = await runAssertion({ expression: PLAYBACK, telemetry: "" });
		expect(empty.findings[0]?.state).toBe("inconclusive");

		const decoy = [
			`{"atMs":0,"kind":"state","payload":{"ok":true,"result":{"playback":{"refused":0,"dispatched":3},"afterTick":9,"beforeTick":1},"request":null}}`,
			"",
		].join("\n");
		const unrelated = await runAssertion({ expression: PLAYBACK, telemetry: decoy });
		expect(unrelated.findings[0]?.state).toBe("inconclusive");
		expect(unrelated.outcome.kind).toBe("inconclusive");
	});

	it("errors when the captured digest does not match the telemetry bytes that were read", async () => {
		const attempt = await runAssertion({
			expression: PLAYBACK,
			telemetry: passingTelemetry,
			digest: "not-the-snapshot",
		});
		expect(attempt.findings[0]?.state).toBe("error");
		expect(attempt.findings[0]?.note).toMatch(/digest/);
	});

	it("does not silently pick the first of several recordings", async () => {
		const path = await telemetryFile(passingTelemetry);
		const digest = sha256Text(passingTelemetry);
		const first = recordingEvidence(path, { recordingId: "rec_a", digest, id: `recording:rec_a:${digest}` });
		const second = recordingEvidence(path, { recordingId: "rec_b", digest, id: `recording:rec_b:${digest}` });
		const store = new InMemoryEvaluationStore();
		const service = new EvaluationService({
			store,
			evidenceProvider: { kind: "recording", capture: async () => ({ evidence: [first, second] }) },
			verifierRunner: createNodeVerifierRunner(),
		});
		const definition = await service.upsertDefinition(scope, {
			title: "Greybox probe",
			criteria: [
				{
					title: "telemetry assertion",
					required: true,
					verifier: { kind: "assertion", source: "recording-telemetry", expression: PLAYBACK },
				},
			],
		});
		const ambiguous = await service.run({ scope, definitionId: definition.id, trigger: { kind: "manual" } });
		expect(ambiguous.findings[0]?.state).toBe("inconclusive");
		expect(ambiguous.findings[0]?.note).toMatch(/Multiple recording/);

		const selected = await service.run({
			scope,
			definitionId: definition.id,
			trigger: { kind: "manual", ref: "rec_b" },
		});
		expect(selected.findings[0]?.state).toBe("passed");
		expect(selected.findings[0]?.evidenceIds).toEqual([second.id]);
	});

	it("does not treat a milestone ref as a recording id", async () => {
		const attempt = await runAssertion({
			expression: PLAYBACK,
			telemetry: passingTelemetry,
			trigger: { kind: "milestone", ref: "greybox-1" },
		});
		expect(attempt.findings[0]?.state).toBe("passed");
	});

	it("still evaluates a recording whose source.projectKey differs from the evaluation scope", async () => {
		const attempt = await runAssertion({
			expression: PLAYBACK,
			telemetry: passingTelemetry,
			projectKey: "GameStudioHash24Legacy",
		});
		expect(attempt.findings[0]?.state).toBe("passed");
	});

	it("uses the sole recording when manual.ref is not that recording id", async () => {
		const attempt = await runAssertion({
			expression: PLAYBACK,
			telemetry: passingTelemetry,
			recordingId: "rec_greybox",
			trigger: { kind: "manual", ref: "not-a-recording-id" },
		});
		expect(attempt.findings[0]?.state).toBe("passed");
	});

	it("errors on an illegal expression even when no recording evidence exists", async () => {
		const attempt = await runAssertion({
			expression: "playback.refused === 0 && playback.dispatched > 0",
			telemetry: passingTelemetry,
			evidence: [],
		});
		expect(attempt.findings[0]?.state).toBe("error");
		expect(attempt.findings[0]?.note).toMatch(/JSON/);
		expect(attempt.outcome.kind).toBe("error");
	});
});
