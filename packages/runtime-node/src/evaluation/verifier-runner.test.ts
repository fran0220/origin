import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvaluationService, InMemoryEvaluationStore } from "@vetta/runtime-evaluation";
import { afterEach, describe, expect, it } from "vitest";
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
