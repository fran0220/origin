import type { RuntimeToolDefinition } from "@origin/runtime-core/kernel";
import type { EvaluationScope, EvaluationTrigger } from "@origin/runtime-evaluation";
import { ToolCallDescriptionSchema } from "@origin/runtime-tools/coding";
import { type Static, Type } from "@sinclair/typebox";
import type { ConversationScenario } from "../../profiles/index.js";
import type { CodingAgentRuntimeToolRegistration } from "../../runtime-contracts/index.js";
import type { CodingAgentEvaluationOperations } from "./contracts.js";
import {
	EVALUATION_GET_TOOL_DESCRIPTION,
	EVALUATION_LIST_TOOL_DESCRIPTION,
	EVALUATION_RUN_TOOL_DESCRIPTION,
} from "./description.js";

const ScopeSchema = Type.Union([
	Type.Object({ kind: Type.Literal("global") }, { additionalProperties: false }),
	Type.Object(
		{ kind: Type.Literal("project"), projectKey: Type.String({ minLength: 1 }) },
		{ additionalProperties: false },
	),
]);

const TriggerSchema = Type.Object(
	{
		kind: Type.Union([
			Type.Literal("turn"),
			Type.Literal("checkpoint"),
			Type.Literal("milestone"),
			Type.Literal("manual"),
		]),
		ref: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export const EvaluationRunToolInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	definitionId: Type.String({ description: "Evaluation definition id to run." }),
	trigger: Type.Optional(TriggerSchema),
	scope: Type.Optional(ScopeSchema),
});

export const EvaluationListToolInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	scope: Type.Optional(ScopeSchema),
});

export const EvaluationGetToolInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	attemptId: Type.String({ description: "Immutable Evaluation attempt id." }),
	scope: Type.Optional(ScopeSchema),
});

export type EvaluationRunToolInput = Static<typeof EvaluationRunToolInputSchema>;
export type EvaluationListToolInput = Static<typeof EvaluationListToolInputSchema>;
export type EvaluationGetToolInput = Static<typeof EvaluationGetToolInputSchema>;

export const EVALUATION_TOOL_SCOPES = [
	"conversation",
	"project",
	"cli",
	"batch",
	"automation",
] as const satisfies readonly ConversationScenario[];
export const EVALUATION_TOOL_CATEGORY = "agent-control" as const;

export interface EvaluationToolOptions {
	readonly operations: CodingAgentEvaluationOperations;
	readonly resolveScope: () => EvaluationScope;
	readonly modelOrder?: number;
}

function resolveScope(inputScope: EvaluationScope | undefined, resolveScope: () => EvaluationScope): EvaluationScope {
	return inputScope ?? resolveScope();
}

export function createEvaluationRunTool(options: EvaluationToolOptions): RuntimeToolDefinition<EvaluationRunToolInput> {
	return {
		name: "evaluation_run",
		label: "Evaluation Run",
		description: EVALUATION_RUN_TOOL_DESCRIPTION,
		inputSchema: EvaluationRunToolInputSchema,
		async execute({ input }) {
			const trigger: EvaluationTrigger = input.trigger ?? { kind: "manual" };
			const attempt = await options.operations.run({
				scope: resolveScope(input.scope, options.resolveScope),
				definitionId: input.definitionId,
				trigger,
			});
			return {
				content: [
					{
						type: "text",
						text:
							`evaluation_run ${attempt.outcome.kind} — attempt ${attempt.id}, ` +
							`definition ${attempt.definitionId}@${attempt.definitionRevision}`,
					},
				],
				details: attempt,
			};
		},
	};
}

export function createEvaluationListTool(
	options: EvaluationToolOptions,
): RuntimeToolDefinition<EvaluationListToolInput> {
	return {
		name: "evaluation_list",
		label: "Evaluation List",
		description: EVALUATION_LIST_TOOL_DESCRIPTION,
		inputSchema: EvaluationListToolInputSchema,
		async execute({ input }) {
			const scope = resolveScope(input.scope, options.resolveScope);
			const [definitions, attempts] = await Promise.all([
				options.operations.listDefinitions(scope),
				options.operations.listAttempts(scope),
			]);
			const listing = definitions
				.map((definition) => {
					const latest = attempts.find((attempt) => attempt.definitionId === definition.id);
					return (
						`- ${definition.id} rev ${definition.revision}: ${definition.title}` +
						(latest ? ` (latest ${latest.outcome.kind} ${latest.id})` : "")
					);
				})
				.join("\n");
			return {
				content: [
					{
						type: "text",
						text: definitions.length === 0 ? "No Evaluation definitions." : listing,
					},
				],
				details: { definitions, attempts: attempts.slice(0, 20) },
			};
		},
	};
}

export function createEvaluationGetTool(options: EvaluationToolOptions): RuntimeToolDefinition<EvaluationGetToolInput> {
	return {
		name: "evaluation_get",
		label: "Evaluation Get",
		description: EVALUATION_GET_TOOL_DESCRIPTION,
		inputSchema: EvaluationGetToolInputSchema,
		async execute({ input }) {
			const view = await options.operations.get(resolveScope(input.scope, options.resolveScope), input.attemptId);
			const findings = view.attempt.findings
				.map((finding) => {
					const evidence = finding.evidenceIds.join(", ") || "none";
					return (
						`- ${finding.criterionId}: ${finding.state} (evidence ${evidence})` +
						(finding.note ? `\n  note: ${finding.note}` : "")
					);
				})
				.join("\n");
			return {
				content: [
					{
						type: "text",
						text:
							`attempt ${view.attempt.id} ${view.attempt.outcome.kind}\n` +
							`definition ${view.definition.title} rev ${view.attempt.definitionRevision}\n${findings}`,
					},
				],
				details: view,
			};
		},
	};
}

export function createEvaluationToolRegistrations(
	options: EvaluationToolOptions,
): readonly CodingAgentRuntimeToolRegistration[] {
	const tools = [
		createEvaluationRunTool(options),
		createEvaluationListTool(options),
		createEvaluationGetTool(options),
	];
	return tools.map((tool, index) => ({
		tool: { ...tool, modelOrder: options.modelOrder === undefined ? undefined : options.modelOrder + index },
		scopeUse: EVALUATION_TOOL_SCOPES,
		modelOrder: options.modelOrder === undefined ? undefined : options.modelOrder + index,
		category: EVALUATION_TOOL_CATEGORY,
	}));
}
