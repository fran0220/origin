import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "evaluation.ts"), "utf8");

describe("evaluation IPC contract", () => {
	it("registers the documented Evaluation channels and nothing else", () => {
		expect(source).toContain("vetta:evaluation:list-definitions");
		expect(source).toContain("vetta:evaluation:upsert-definition");
		expect(source).toContain("vetta:evaluation:list-attempts");
		expect(source).toContain("vetta:evaluation:get");
		expect(source).toContain("vetta:evaluation:run");
		expect(source).toContain("vetta:evaluation:cancel");
		expect(source).toContain("vetta:evaluation:register-provider");
		expect(source).toContain("vetta:evaluation:unregister-provider");
		expect(source).toContain("ipcMain.removeHandler(channel)");
	});

	it("keeps handlers thin and delegates to the evaluation service", () => {
		expect(source).toContain("listEvaluationDefinitions");
		expect(source).toContain("upsertEvaluationDefinition");
		expect(source).toContain("listEvaluationAttempts");
		expect(source).toContain("getEvaluation");
		expect(source).toContain("runEvaluation");
		expect(source).toContain("cancelEvaluation");
		expect(source).not.toMatch(/writeFile|appendFile|FileEvaluationStore/);
	});
});
