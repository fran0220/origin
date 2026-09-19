import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface ManifestAgent {
	agents?: Array<{ id: string }>;
	skillPaths?: string[];
	mcpServers?: Record<string, { type: string; url: string }>;
}

interface Manifest {
	id: string;
	pluginApiVersion: string;
	commands?: string[];
	agent?: ManifestAgent;
}

describe("origin-game-studio manifest", () => {
	it("declares game-director, skill paths and remote Origin MCP servers", () => {
		const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "../plugin.json"), "utf8")) as Manifest;
		expect(manifest.id).toBe("origin-game-studio");
		expect(manifest.pluginApiVersion).toBe("^2.0.0");
		expect(manifest.agent?.agents?.map((agent) => agent.id)).toEqual(["game-director"]);
		expect(manifest.agent?.skillPaths?.length).toBeGreaterThanOrEqual(10);
		expect(manifest.agent?.mcpServers).toMatchObject({
			"origin-assets": { type: "http", url: "https://api.origingame.dev/v1/assets/mcp" },
			"origin-examples": { type: "http", url: "https://registry.origingame.dev/mcp" },
			"origin-game-knowledge": { type: "http", url: "https://knowledge.origingame.dev/mcp" },
		});
		expect(manifest.commands).toEqual(expect.arrayContaining(["bun", "node"]));
	});
});
