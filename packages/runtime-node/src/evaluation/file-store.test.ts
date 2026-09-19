import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileEvaluationStore } from "./file-store.js";

const scope = { kind: "project" as const, projectKey: "demo" };

describe("FileEvaluationStore", () => {
	const directories: string[] = [];

	afterEach(async () => {
		for (const directory of directories.splice(0)) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("persists definitions, attempts and evidence under the agentDir evaluation ledger", async () => {
		const rootDir = await mkdtemp(join(tmpdir(), "evaluation-store-"));
		directories.push(rootDir);
		const store = new FileEvaluationStore({ rootDir });
		const definition = await store.upsertDefinition(scope, {
			id: "def-1",
			revision: 1,
			title: "Build",
			criteria: [{ id: "c1", title: "Compiles", required: true }],
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await store.putEvidence(scope, {
			id: "ev-1",
			source: { kind: "trace", traceId: "t1" },
			capturedAt: "2026-01-01T00:00:00.000Z",
			digest: "aa",
			summary: "trace",
		});
		await store.appendAttempt({
			id: "evaluation-1",
			scope,
			definitionId: definition.id,
			definitionRevision: 1,
			trigger: { kind: "manual" },
			inputFingerprint: "fp",
			evidenceIds: ["ev-1"],
			findings: [{ criterionId: "c1", state: "passed", evidenceIds: ["ev-1"] }],
			outcome: { kind: "passed", settledAt: "2026-01-01T00:00:00.000Z" },
			createdAt: "2026-01-01T00:00:00.000Z",
		});

		const reopened = new FileEvaluationStore({ rootDir });
		expect((await reopened.getDefinition(scope, "def-1"))?.title).toBe("Build");
		expect((await reopened.getAttempt(scope, "evaluation-1"))?.outcome.kind).toBe("passed");
		expect((await reopened.getEvidence(scope, "ev-1"))?.digest).toBe("aa");
		await expect(
			reopened.appendAttempt({
				id: "evaluation-1",
				scope,
				definitionId: definition.id,
				definitionRevision: 1,
				trigger: { kind: "manual" },
				inputFingerprint: "fp",
				evidenceIds: [],
				findings: [],
				outcome: { kind: "passed", settledAt: "2026-01-01T00:00:00.000Z" },
				createdAt: "2026-01-01T00:00:00.000Z",
			}),
		).rejects.toMatchObject({ code: "immutable" });
	});
});
