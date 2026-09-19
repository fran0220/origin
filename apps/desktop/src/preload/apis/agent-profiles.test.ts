import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createAgentProfilesApi } from "./agent-profiles.js";

describe("createAgentProfilesApi", () => {
	it("forwards profile configuration operations to their dedicated channels", async () => {
		const invoke = vi.fn(async () => undefined);
		const api = createAgentProfilesApi({ invoke } as unknown as IpcRenderer).agentProfiles;
		const agent = {
			name: "Builder",
			mentionHandle: "builder",
			blueprintId: "builder",
			abilities: { selectionMode: "custom" as const, skills: [], mcpServers: [], plugins: [] },
		};

		await api.createAgent(agent);
		await api.updateAgent("agent", {
			expectedRevision: 1,
			name: "Builder",
			description: "",
			mentionHandle: "builder",
			abilities: { selectionMode: "custom" as const, skills: [], mcpServers: [], plugins: [] },
		});
		await api.deleteAgent("agent", { expectedRevision: 1 });
		await api.list();
		await api.listBlueprints();
		await api.uploadAvatar();

		expect(invoke).toHaveBeenNthCalledWith(1, "origin:agent-profiles:create-agent", agent);
		expect(invoke).toHaveBeenNthCalledWith(2, "origin:agent-profiles:update-agent", "agent", {
			expectedRevision: 1,
			name: "Builder",
			description: "",
			mentionHandle: "builder",
			abilities: { selectionMode: "custom" as const, skills: [], mcpServers: [], plugins: [] },
		});
		expect(invoke).toHaveBeenNthCalledWith(3, "origin:agent-profiles:delete-agent", "agent", {
			expectedRevision: 1,
		});
		expect(invoke).toHaveBeenNthCalledWith(4, "origin:agent-profiles:list");
		expect(invoke).toHaveBeenNthCalledWith(5, "origin:agent-profiles:list-blueprints");
		expect(invoke).toHaveBeenNthCalledWith(6, "origin:agent-profiles:upload-avatar");
	});
});
