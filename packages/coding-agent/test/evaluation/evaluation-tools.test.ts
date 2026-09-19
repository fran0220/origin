import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { EvaluationAttempt, EvaluationDefinition, EvaluationScope } from "@vetta/runtime-evaluation";
import { describe, expect, it } from "vitest";
import type { CodingAgentEvaluationOperations } from "../../src/features/evaluation/contracts.js";
import {
	createEvaluationToolRegistrations,
	EVALUATION_GET_TOOL_DESCRIPTION,
	EVALUATION_LIST_TOOL_DESCRIPTION,
	EVALUATION_RUN_TOOL_DESCRIPTION,
	EVALUATION_TOOL_CATEGORY,
	EVALUATION_TOOL_SCOPES,
	type EvaluationGetToolInput,
	type EvaluationListToolInput,
	type EvaluationRunToolInput,
} from "../../src/features/evaluation/index.js";

const scope: EvaluationScope = { kind: "global" };

describe("Evaluation tools", () => {
	it("keeps model-visible names, descriptions and registration metadata", () => {
		const registrations = createEvaluationToolRegistrations({
			operations: createOperations(),
			resolveScope: () => scope,
			modelOrder: 3_250,
		});
		expect(
			registrations.map(({ tool, scopeUse, category, modelOrder }) => ({
				name: tool.name,
				label: tool.label,
				description: tool.description,
				scopeUse,
				category,
				modelOrder,
			})),
		).toEqual([
			{
				name: "evaluation_run",
				label: "Evaluation Run",
				description: EVALUATION_RUN_TOOL_DESCRIPTION,
				scopeUse: EVALUATION_TOOL_SCOPES,
				category: EVALUATION_TOOL_CATEGORY,
				modelOrder: 3_250,
			},
			{
				name: "evaluation_list",
				label: "Evaluation List",
				description: EVALUATION_LIST_TOOL_DESCRIPTION,
				scopeUse: EVALUATION_TOOL_SCOPES,
				category: EVALUATION_TOOL_CATEGORY,
				modelOrder: 3_251,
			},
			{
				name: "evaluation_get",
				label: "Evaluation Get",
				description: EVALUATION_GET_TOOL_DESCRIPTION,
				scopeUse: EVALUATION_TOOL_SCOPES,
				category: EVALUATION_TOOL_CATEGORY,
				modelOrder: 3_252,
			},
		]);
	});

	it("runs, lists and reads an attempt through the host operations", async () => {
		const operations = createOperations();
		const registrations = createEvaluationToolRegistrations({
			operations,
			resolveScope: () => scope,
		});
		const run = registrations[0]!.tool as RuntimeToolDefinition<EvaluationRunToolInput>;
		const list = registrations[1]!.tool as RuntimeToolDefinition<EvaluationListToolInput>;
		const get = registrations[2]!.tool as RuntimeToolDefinition<EvaluationGetToolInput>;

		const runResult = await execute(run, {
			description: "run",
			definitionId: "def-1",
			trigger: { kind: "manual" },
		});
		expect(runResult.content[0]).toMatchObject({ type: "text" });
		expect(String((runResult.content[0] as { text: string }).text)).toContain("failed");

		const listResult = await execute(list, { description: "list" });
		expect(String((listResult.content[0] as { text: string }).text)).toContain("def-1");

		const getResult = await execute(get, { description: "get", attemptId: "attempt-1" });
		expect(String((getResult.content[0] as { text: string }).text)).toContain("c1: failed");
		expect(String((getResult.content[0] as { text: string }).text)).toContain("ev-1");
	});
});

async function execute<TInput extends object>(tool: RuntimeToolDefinition<TInput>, input: TInput) {
	return tool.execute({
		sessionId: "session",
		turnId: "turn",
		toolCallId: "evaluation",
		input,
		signal: new AbortController().signal,
	});
}

function createOperations(): CodingAgentEvaluationOperations {
	const definition: EvaluationDefinition = {
		id: "def-1",
		revision: 1,
		title: "Build",
		criteria: [
			{ id: "c1", title: "Compiles", required: true },
			{ id: "c2", title: "Notes", required: false },
		],
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
	const attempt: EvaluationAttempt = {
		id: "attempt-1",
		scope,
		definitionId: definition.id,
		definitionRevision: 1,
		trigger: { kind: "manual" },
		inputFingerprint: "fp",
		evidenceIds: ["ev-1"],
		findings: [{ criterionId: "c1", state: "failed", evidenceIds: ["ev-1"], note: "command exited 1" }],
		outcome: { kind: "failed", settledAt: "2026-01-01T00:00:01.000Z" },
		createdAt: "2026-01-01T00:00:01.000Z",
	};
	return {
		listDefinitions: async () => [definition],
		listAttempts: async () => [attempt],
		get: async () => ({
			attempt,
			definition,
			evidence: [
				{
					id: "ev-1",
					source: { kind: "execution-receipt", executionId: "exec-1" },
					capturedAt: "2026-01-01T00:00:01.000Z",
					digest: "aa",
					summary: "test -f missing.txt",
				},
			],
		}),
		run: async () => attempt,
	};
}
