import type { SubagentCoordinatorPort } from "@origin/runtime-subagents";
import {
	CODING_AGENT_MODEL_TOOL_ORDER,
	CODING_AGENT_SUBAGENT_MODEL_TOOL_ORDER_STEP,
} from "../../tool-policy/model-tool-order.js";
import {
	createFollowupTaskToolRegistration,
	createInterruptAgentToolRegistration,
	createListAgentsToolRegistration,
	createSendMessageToolRegistration,
	createSpawnAgentToolRegistration,
	createWaitAgentToolRegistration,
} from "./tools/index.js";

/** 组装 Coding Agent 工具顺序；协议归 @origin/runtime-tools，Node 实现归 @origin/runtime-node。 */
export function createCodingAgentSubagentRuntimeToolRegistrations(
	getCoordinator: () => SubagentCoordinatorPort | undefined,
) {
	const order = (index: number) =>
		CODING_AGENT_MODEL_TOOL_ORDER.subagentStart + index * CODING_AGENT_SUBAGENT_MODEL_TOOL_ORDER_STEP;
	return [
		createSpawnAgentToolRegistration({ getCoordinator, modelOrder: order(0) }),
		createWaitAgentToolRegistration({ getCoordinator, modelOrder: order(1) }),
		createListAgentsToolRegistration({ getCoordinator, modelOrder: order(2) }),
		createInterruptAgentToolRegistration({ getCoordinator, modelOrder: order(3) }),
		createSendMessageToolRegistration({ getCoordinator, modelOrder: order(4) }),
		createFollowupTaskToolRegistration({ getCoordinator, modelOrder: order(5) }),
	] as const;
}
