import type { PluginOfficialApi } from "@origin-org/plugin-sdk";

export function createOfficialAgentApi(
	assertOfficial: () => void,
	capabilitySessionId: string,
): PluginOfficialApi["agent"] {
	const agentSettings = window.originApp.plugins.internalCapabilities.agentSettings;
	return {
		getExperimental: async () => {
			assertOfficial();
			return agentSettings.getExperimental(capabilitySessionId);
		},
		setExperimental: async (input) => {
			assertOfficial();
			return agentSettings.setExperimental(capabilitySessionId, input);
		},
		getImageGeneration: async () => {
			assertOfficial();
			return agentSettings.getImageGeneration(capabilitySessionId);
		},
		setImageGeneration: async (input) => {
			assertOfficial();
			return agentSettings.setImageGeneration(capabilitySessionId, input);
		},
	};
}
