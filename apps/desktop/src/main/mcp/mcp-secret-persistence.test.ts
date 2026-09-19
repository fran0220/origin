import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { CredentialVault, mcpSecretRef } from "@origin/runtime-node/credentials";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = await vi.hoisted(async () => {
	const { mkdtempSync } = await import("node:fs");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");
	return { root: mkdtempSync(join(tmpdir(), "origin-mcp-secrets-")), available: true };
});

vi.mock("@origin/action-rpc", () => ({ getOriginHomePath: () => fixture.root }));
vi.mock("../abilities/ability-ledger.js", () => ({
	recordAbilityInstall: vi.fn(),
	removeAbilityLedgerEntry: vi.fn(),
}));
vi.mock("../abilities/open-marketplace/open-marketplace-mcp-runtime-host.js", () => ({
	stopOpenMarketplaceManagedMcpRuntime: vi.fn(),
}));
vi.mock("./migrations/index.js", () => ({ ensureMcpFileMigrations: vi.fn() }));
vi.mock("../credentials/desktop-credential-vault.js", () => ({ getDesktopCredentialVault: () => vault }));

import { McpSettingsService, readMcpConfig, writeMcpConfig } from "./mcp-settings-service.js";

const vault = new CredentialVault(join(fixture.root, "vault"), {
	backend: "test",
	custody: "os-protected",
	isAvailable: () => fixture.available,
	encrypt: (text) => Buffer.from(text).toString("base64"),
	decrypt: (text) => Buffer.from(text, "base64").toString(),
});
const configPath = join(fixture.root, "agent", "mcp.json");
beforeEach(() => {
	fixture.available = true;
	rmSync(join(fixture.root, "agent"), { recursive: true, force: true });
	rmSync(join(fixture.root, "vault"), { recursive: true, force: true });
});
afterAll(() => rmSync(fixture.root, { recursive: true, force: true }));

describe("MCP credential persistence", () => {
	it("protects the first save, preserves masked edits, and updates credentials without restarting", async () => {
		const service = new McpSettingsService({ readConfig: readMcpConfig, writeConfig: writeMcpConfig });
		const config = {
			mcpServers: {
				web: {
					type: "http" as const,
					url: "https://mcp.example.test",
					headers: { Authorization: "Bearer first-secret", Region: "eu" },
				},
				local: { command: "node", env: { API_KEY: "local-secret", REGION: "us" } },
			},
		};
		await service.replaceConfig(config);
		const first = readFileSync(configPath, "utf8");
		expect(first).not.toContain("first-secret");
		expect(first).not.toContain("local-secret");
		expect(first).toContain("vault://");
		expect(config.mcpServers.local.env.API_KEY).toBe("local-secret");
		expect(vault.get(mcpSecretRef("web", "headers", "Authorization"))).toBe("Bearer first-secret");
		expect(vault.get(mcpSecretRef("local", "env", "API_KEY"))).toBe("local-secret");
		expect(await service.get("local")).toMatchObject({ env: { API_KEY: "***", REGION: "us" } });

		await service.replaceConfig({
			mcpServers: {
				web: { ...config.mcpServers.web, headers: { Authorization: "***", Region: "ap" } },
				local: config.mcpServers.local,
			},
		});
		expect(vault.get(mcpSecretRef("web", "headers", "Authorization"))).toBe("Bearer first-secret");
		await service.upsert("web", { type: "http", headers: { Authorization: "Bearer replacement-secret" } });
		expect(vault.get(mcpSecretRef("web", "headers", "Authorization"))).toBe("Bearer replacement-secret");
		expect(readFileSync(configPath, "utf8")).not.toContain("replacement-secret");
		await service.setEnabled("local", false);
		expect(await service.get("local")).toMatchObject({ disabled: true, env: { API_KEY: "***", REGION: "us" } });
	});

	it("does not write a new config when credential storage fails", async () => {
		const service = new McpSettingsService({ readConfig: readMcpConfig, writeConfig: writeMcpConfig });
		await service.replaceConfig({ mcpServers: {} });
		const previous = readFileSync(configPath, "utf8");
		fixture.available = false;
		await expect(
			service.replaceConfig({
				mcpServers: {
					local: { command: "node", env: { API_KEY: "must-not-reach-disk" } },
				},
			}),
		).rejects.toThrow("Secure credential storage is unavailable");
		expect(readFileSync(configPath, "utf8")).toBe(previous);
	});
});
