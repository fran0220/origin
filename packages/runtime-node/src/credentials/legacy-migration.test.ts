import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decodeVaultRef, migrateLegacySecrets } from "./legacy-migration.js";
import { OwnerOnlyFileCryptography } from "./owner-only-cryptography.js";
import { ACCOUNT_ACCESS_TOKEN_REF, ACCOUNT_REFRESH_TOKEN_REF, mcpSecretRef, modelApiKeyRef } from "./types.js";
import { CredentialVault } from "./vault.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("legacy secret migration", () => {
	it("moves settings, mcp, models, and auth.json secrets into the vault and deletes them from the source files", () => {
		const root = createTemporaryDirectory();
		const settingsPath = join(root, "settings.json");
		const modelsPath = join(root, "models.json");
		const mcpPath = join(root, "mcp.json");
		const authJsonPath = join(root, "auth.json");
		writeFileSync(
			settingsPath,
			JSON.stringify({
				theme: "dark",
				serverToken: "access-from-settings",
				serverRefreshToken: "refresh-from-settings",
			}),
		);
		writeFileSync(
			modelsPath,
			JSON.stringify({ providers: { openai: { apiKey: "sk-openai-plain", baseUrl: "https://api.openai.com/v1" } } }),
		);
		writeFileSync(
			mcpPath,
			JSON.stringify({
				mcpServers: {
					search: {
						type: "http",
						url: "https://mcp.example.com",
						headers: { Authorization: "Bearer mcp-secret", "X-Region": "us" },
						env: { API_KEY: "mcp-env-secret", REGION: "us" },
					},
				},
			}),
		);
		writeFileSync(
			authJsonPath,
			JSON.stringify({ baseUrl: "https://api.example.com", token: "access-from-auth-json" }),
		);

		const vault = new CredentialVault(join(root, "vault"), new OwnerOnlyFileCryptography(join(root, "key")));
		const result = migrateLegacySecrets({ vault, settingsPath, modelsPath, mcpPath, authJsonPath });

		expect(result.migrated).toBeGreaterThan(0);
		const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
		expect(settings.serverToken).toBeUndefined();
		expect(settings.serverRefreshToken).toBeUndefined();
		expect(settings.theme).toBe("dark");
		expect(vault.get(ACCOUNT_ACCESS_TOKEN_REF)).toBe("access-from-settings");
		expect(vault.get(ACCOUNT_REFRESH_TOKEN_REF)).toBe("refresh-from-settings");

		const models = JSON.parse(readFileSync(modelsPath, "utf8")) as {
			providers: Record<string, { apiKey?: string; credentialRef?: string }>;
		};
		expect(models.providers.openai?.apiKey).toBeUndefined();
		expect(models.providers.openai?.credentialRef).toBeTruthy();
		expect(vault.get(modelApiKeyRef(models.providers.openai?.credentialRef ?? ""))).toBe("sk-openai-plain");

		const mcp = JSON.parse(readFileSync(mcpPath, "utf8")) as {
			mcpServers: { search: { headers: Record<string, string>; env: Record<string, string> } };
		};
		expect(mcp.mcpServers.search.headers["X-Region"]).toBe("us");
		expect(mcp.mcpServers.search.env.REGION).toBe("us");
		expect(decodeVaultRef(mcp.mcpServers.search.headers.Authorization)).toEqual(
			mcpSecretRef("search", "headers", "Authorization"),
		);
		expect(vault.get(mcpSecretRef("search", "headers", "Authorization"))).toBe("Bearer mcp-secret");
		expect(vault.get(mcpSecretRef("search", "env", "API_KEY"))).toBe("mcp-env-secret");

		const auth = JSON.parse(readFileSync(authJsonPath, "utf8")) as { token?: string; baseUrl: string };
		expect(auth.token).toBeUndefined();
		expect(auth.baseUrl).toBe("https://api.example.com");
		expect(JSON.stringify(settings)).not.toContain("access-from-settings");
		expect(JSON.stringify(models)).not.toContain("sk-openai-plain");
		expect(JSON.stringify(mcp)).not.toContain("mcp-secret");
	});
});

function createTemporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "vetta-secret-migration-"));
	temporaryDirectories.push(directory);
	return directory;
}
