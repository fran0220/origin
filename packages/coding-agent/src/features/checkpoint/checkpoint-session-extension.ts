import type { SessionExtensionDefinition } from "@vetta/runtime-core/session-extensions";
import { createCheckpointTurnObserver } from "./checkpoint-turn-feature.js";
import type { CheckpointTurnHost } from "./contracts.js";

export const CODING_AGENT_CHECKPOINT_EXTENSION_ID = "coding-agent.checkpoint";

export function createCodingAgentCheckpointSessionExtension(host: CheckpointTurnHost): SessionExtensionDefinition {
	return {
		id: CODING_AGENT_CHECKPOINT_EXTENSION_ID,
		async create() {
			const observer = createCheckpointTurnObserver(host);
			return {
				contributions: [
					{
						kind: "agent-feature",
						feature: {
							id: CODING_AGENT_CHECKPOINT_EXTENSION_ID,
							async prepare() {
								return {
									async contribute() {
										return { observers: [observer] };
									},
									async dispose() {},
								};
							},
						},
					},
				],
				async dispose() {},
			};
		},
	};
}
