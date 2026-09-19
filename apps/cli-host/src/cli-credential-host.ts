import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getVettaHomePath } from "@origin/action-rpc";
import { getAgentDir } from "@origin/coding-agent/config";
import {
	ACCOUNT_ACCESS_TOKEN_REF,
	ACCOUNT_REFRESH_TOKEN_REF,
	CredentialVault,
	connectionSecretRef,
	migrateLegacySecrets,
	OwnerOnlyFileCryptography,
	ownerOnlyKeyDirectory,
} from "@origin/runtime-node/credentials";

export function vettaHome(): string {
	return process.env.VETTA_HOME?.trim() || join(homedir(), ".vetta");
}

export function createCliCredentialVault(): CredentialVault {
	const root = join(vettaHome(), "cli", "credentials");
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const cryptography = new OwnerOnlyFileCryptography(ownerOnlyKeyDirectory(root));
	const vault = new CredentialVault(root, cryptography, {
		code: "owner-only-file-fallback",
		backend: cryptography.backend,
		message: "CLI credentials use an owner-only file (mode 0600). This is not OS-protected encryption.",
	});
	migrateLegacySecrets({
		vault,
		settingsPath: join(getAgentDir(), "settings.json"),
		modelsPath: join(getAgentDir(), "models.json"),
		mcpPath: join(getAgentDir(), "mcp.json"),
		authJsonPath: join(getVettaHomePath(), "auth.json"),
	});
	return vault;
}

export { ACCOUNT_ACCESS_TOKEN_REF, ACCOUNT_REFRESH_TOKEN_REF, connectionSecretRef };
