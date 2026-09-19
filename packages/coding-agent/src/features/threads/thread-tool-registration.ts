import type { ConversationScenario } from "../../profiles/index.js";
import type { CodingAgentRuntimeToolRegistration } from "../../runtime-contracts/index.js";
import type { CodingAgentThreadToolHost } from "./contracts.js";
import {
	type CreateThreadInput,
	createCreateThreadTool,
	createFindThreadTool,
	createReadThreadTool,
	createSendThreadMessageTool,
	createWaitForThreadsTool,
	type FindThreadInput,
	type ReadThreadInput,
	type SendThreadMessageInput,
	type WaitForThreadsInput,
} from "./thread-tools.js";

export const THREAD_TOOL_SCOPES = ["conversation", "project", "cli"] as const satisfies readonly ConversationScenario[];
export const THREAD_TOOL_CATEGORY = "agent-control" as const;

export function createThreadToolRegistrations(
	host: CodingAgentThreadToolHost,
): readonly CodingAgentRuntimeToolRegistration[] {
	const wrap = <TInput extends object>(
		tool: CodingAgentRuntimeToolRegistration<TInput>["tool"],
	): CodingAgentRuntimeToolRegistration<TInput> => ({
		tool,
		scopeUse: THREAD_TOOL_SCOPES,
		category: THREAD_TOOL_CATEGORY,
	});
	return [
		wrap<CreateThreadInput>(createCreateThreadTool(host)),
		wrap<SendThreadMessageInput>(createSendThreadMessageTool(host)),
		wrap<WaitForThreadsInput>(createWaitForThreadsTool(host)),
		wrap<FindThreadInput>(createFindThreadTool(host)),
		wrap<ReadThreadInput>(createReadThreadTool(host)),
	];
}
