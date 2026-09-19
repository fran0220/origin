import type { AgentFeatureDefinition } from "@vetta/runtime-core/kernel";
import type { CodingAgentRuntimeToolRegistration } from "../../runtime-contracts/index.js";

export function createCodingAgentHarnessRuntimeFeature(
	registrations: readonly CodingAgentRuntimeToolRegistration[],
): AgentFeatureDefinition {
	return {
		id: "coding-agent.harness",
		async prepare(context) {
			context.signal.throwIfAborted();
			return {
				async contribute(contributionContext) {
					contributionContext.signal.throwIfAborted();
					return { tools: registrations.map((registration) => registration.tool) };
				},
				async dispose() {},
			};
		},
	};
}
