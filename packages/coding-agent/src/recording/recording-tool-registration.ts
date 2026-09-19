import type { ConversationScenario } from "../profiles/index.js";
import { ALL_SCENARIOS } from "../profiles/index.js";
import type { CodingAgentRuntimeToolRegistration } from "../runtime-contracts/index.js";
import { CODING_AGENT_MODEL_TOOL_ORDER } from "../tool-policy/model-tool-order.js";
import {
	createRecordingClearTool,
	createRecordingListTool,
	createRecordingReadTool,
	createRecordingSampleTool,
	createRecordingStartTool,
	createRecordingStopTool,
	createReviewRecordingTool,
	type RecordingToolOptions,
} from "./recording-tools.js";

export const RECORDING_TOOL_CATEGORY = "core" as const;
export const RECORDING_TOOL_SCOPES = ALL_SCENARIOS as readonly ConversationScenario[];

export function createRecordingToolRegistrations(
	options: RecordingToolOptions,
): readonly CodingAgentRuntimeToolRegistration[] {
	const tools = [
		createRecordingStartTool(options),
		createRecordingStopTool(options),
		createRecordingSampleTool(options),
		createRecordingReadTool(options),
		createRecordingListTool(options),
		createRecordingClearTool(options),
		createReviewRecordingTool(options),
	];
	const orders = [
		CODING_AGENT_MODEL_TOOL_ORDER.recordingStart,
		CODING_AGENT_MODEL_TOOL_ORDER.recordingStop,
		CODING_AGENT_MODEL_TOOL_ORDER.recordingSample,
		CODING_AGENT_MODEL_TOOL_ORDER.recordingRead,
		CODING_AGENT_MODEL_TOOL_ORDER.recordingList,
		CODING_AGENT_MODEL_TOOL_ORDER.recordingClear,
		CODING_AGENT_MODEL_TOOL_ORDER.reviewRecording,
	];
	return tools.map((tool, index) => ({
		tool: { ...tool, modelOrder: orders[index] },
		scopeUse: RECORDING_TOOL_SCOPES,
		modelOrder: orders[index],
		category: RECORDING_TOOL_CATEGORY,
	}));
}
