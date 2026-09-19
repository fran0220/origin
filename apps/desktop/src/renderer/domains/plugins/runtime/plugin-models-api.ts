import type { PluginModelsApi, PluginPermissionApi } from "@origin-org/plugin-sdk";

export function createPluginModelsApi(permissions: PluginPermissionApi, capabilitySessionId: string): PluginModelsApi {
	return {
		replaceOwnedProviders: async (providers) => {
			permissions.require("models.manage");
			await window.originApp.plugins.internalCapabilities.models.replaceOwnedProviders(
				capabilitySessionId,
				providers,
			);
		},
		listOwnedProviders: async () => {
			permissions.require("models.manage");
			return window.originApp.plugins.internalCapabilities.models.listOwnedProviders(capabilitySessionId);
		},
	};
}
