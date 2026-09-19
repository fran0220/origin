import type { ConversationScenario } from "../../profiles/index.js";
import type { CodingAgentRuntimeToolRegistration } from "../../runtime-contracts/index.js";
import {
	createHarnessListTool,
	createHarnessPromoteTool,
	createHarnessRefineTool,
	createHarnessRollbackTool,
	type HarnessListInput,
	type HarnessPromoteInput,
	type HarnessRefineInput,
	type HarnessRollbackInput,
	type HarnessToolHost,
} from "./harness-tools.js";

export const HARNESS_TOOL_SCOPES = [
	"conversation",
	"project",
	"cli",
	"batch",
	"automation",
] as const satisfies readonly ConversationScenario[];

export const HARNESS_TOOL_CATEGORY = "memory" as const;

export function createHarnessToolRegistrations(host: HarnessToolHost): readonly CodingAgentRuntimeToolRegistration[] {
	const refine = createHarnessRefineTool(host);
	const list = createHarnessListTool(host);
	const rollback = createHarnessRollbackTool(host);
	const promote = createHarnessPromoteTool(host);
	const wrap = <TInput extends object>(
		tool: CodingAgentRuntimeToolRegistration<TInput>["tool"],
	): CodingAgentRuntimeToolRegistration<TInput> => ({
		tool,
		scopeUse: HARNESS_TOOL_SCOPES,
		category: HARNESS_TOOL_CATEGORY,
	});
	return [
		wrap<HarnessRefineInput>(refine),
		wrap<HarnessListInput>(list),
		wrap<HarnessRollbackInput>(rollback),
		wrap<HarnessPromoteInput>(promote),
	];
}
