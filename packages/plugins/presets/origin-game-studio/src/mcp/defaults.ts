import type { PluginStorageApi } from "@origin-org/plugin-sdk";

export const MCP_SETTINGS_PATH = "settings.json";

export const DEFAULT_MCP_SERVERS = {
	"origin-assets": "https://api.origingame.dev/v1/assets/mcp",
	"origin-examples": "https://registry.origingame.dev/mcp",
	"origin-game-knowledge": "https://knowledge.origingame.dev/mcp",
} as const;

export type OriginMcpServerName = keyof typeof DEFAULT_MCP_SERVERS;

export interface GameStudioSettings {
	mcpServers: Record<OriginMcpServerName, string>;
}

export function resolveMcpUrl(
	name: OriginMcpServerName,
	overrides?: Partial<Record<OriginMcpServerName, string>>,
): string {
	const override = overrides?.[name]?.trim();
	return override && override.length > 0 ? override : DEFAULT_MCP_SERVERS[name];
}

export function defaultSettings(): GameStudioSettings {
	return {
		mcpServers: { ...DEFAULT_MCP_SERVERS },
	};
}

function isMcpName(value: string): value is OriginMcpServerName {
	return value in DEFAULT_MCP_SERVERS;
}

export function parseSettings(raw: unknown): GameStudioSettings {
	const settings = defaultSettings();
	if (typeof raw !== "object" || raw === null) return settings;
	const record = raw as Record<string, unknown>;
	const servers = record.mcpServers;
	if (typeof servers !== "object" || servers === null) return settings;
	for (const [name, url] of Object.entries(servers as Record<string, unknown>)) {
		if (!isMcpName(name) || typeof url !== "string") continue;
		const trimmed = url.trim();
		if (trimmed.length > 0) settings.mcpServers[name] = trimmed;
	}
	return settings;
}

export async function loadSettings(storage: PluginStorageApi): Promise<GameStudioSettings> {
	const data = await storage.readFile(MCP_SETTINGS_PATH, "utf8");
	if (data === null) return defaultSettings();
	try {
		return parseSettings(JSON.parse(data));
	} catch {
		return defaultSettings();
	}
}

export async function persistDefaultSettings(storage: PluginStorageApi): Promise<GameStudioSettings> {
	const existing = await storage.readFile(MCP_SETTINGS_PATH, "utf8");
	if (existing !== null) {
		try {
			return parseSettings(JSON.parse(existing));
		} catch {
			return defaultSettings();
		}
	}
	const settings = defaultSettings();
	await storage.writeFile(MCP_SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf8");
	return settings;
}

export function resolveConfiguredMcpUrl(settings: GameStudioSettings, name: OriginMcpServerName): string {
	return resolveMcpUrl(name, settings.mcpServers);
}
