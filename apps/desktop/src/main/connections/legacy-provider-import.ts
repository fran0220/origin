import { readModelsConfigSync } from "../models/model-settings-service.js";
import { getConnectionCatalog } from "./catalog.js";

/**
 * Project existing BYOK providers as Connections so Settings → Connections
 * and Dial routes can see them without a breaking cut-over.
 */
export function importLegacyProvidersAsConnections(): void {
	const catalog = getConnectionCatalog();
	const config = readModelsConfigSync();
	for (const [id, provider] of Object.entries(config.providers)) {
		if (catalog.get(id)) continue;
		const endpoint = provider.baseUrl ?? "https://api.openai.com";
		try {
			catalog.upsertProvided({
				id,
				displayName: provider.displayName ?? id,
				protocol: provider.api ?? "openai",
				endpoint,
				credentialOrigin: "provided",
			});
		} catch {
			// Invalid endpoint stays a models.json provider until the user edits it.
		}
	}
}
