import { join } from "node:path";
import { getOriginHomePath } from "@origin/action-rpc";
import { getAgentDir } from "@origin/coding-agent/config";
import { migrateLegacySecrets } from "@origin/runtime-node/credentials";
import {
	getDesktopCredentialVault,
	getDesktopCredentialVaultWarning,
} from "../credentials/desktop-credential-vault.js";
import { getAppLogger } from "../logger.js";
import { getAccountDirectoryService } from "./account-directory.js";
import { getConnectionCatalog } from "./catalog.js";
import { importLegacyProvidersAsConnections } from "./legacy-provider-import.js";
import { bindModelRuntimeToConnectionRelays } from "./runtime-binding.js";

const log = getAppLogger("connections");

export async function bootstrapConnections(): Promise<void> {
	const agentDir = getAgentDir();
	getAccountDirectoryService(agentDir);
	const vault = getDesktopCredentialVault();
	const warning = getDesktopCredentialVaultWarning();
	if (warning) log.warn(warning.message);

	const result = migrateLegacySecrets({
		vault,
		settingsPath: join(agentDir, "settings.json"),
		modelsPath: join(agentDir, "models.json"),
		mcpPath: join(agentDir, "mcp.json"),
		authJsonPath: join(getOriginHomePath(), "auth.json"),
	});
	if (result.migrated > 0) {
		log.info(`migrated ${result.migrated} secrets into the credential vault`);
	}
	importLegacyProvidersAsConnections();
	await bindModelRuntimeToConnectionRelays();
	void getConnectionCatalog();
}
