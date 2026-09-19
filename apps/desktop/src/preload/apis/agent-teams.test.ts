import type { IpcRenderer } from "electron";
import { describe, expect, it, vi } from "vitest";
import { createAgentTeamsApi } from "./agent-teams.js";

describe("createAgentTeamsApi", () => {
	it("forwards profile configuration operations to their dedicated channels", async () => {
		const invoke = vi.fn(async () => undefined);
		const api = createAgentTeamsApi({ invoke } as unknown as IpcRenderer).agentTeams;
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

		expect(invoke).toHaveBeenNthCalledWith(1, "vetta:agent-teams:create-agent", agent);
		expect(invoke).toHaveBeenNthCalledWith(2, "vetta:agent-teams:update-agent", "agent", {
			expectedRevision: 1,
			name: "Builder",
			description: "",
			mentionHandle: "builder",
			abilities: { selectionMode: "custom" as const, skills: [], mcpServers: [], plugins: [] },
		});
		expect(invoke).toHaveBeenNthCalledWith(3, "vetta:agent-teams:delete-agent", "agent", {
			expectedRevision: 1,
		});
		expect(invoke).toHaveBeenNthCalledWith(4, "vetta:agent-teams:list");
		expect(invoke).toHaveBeenNthCalledWith(5, "vetta:agent-teams:list-blueprints");
		expect(invoke).toHaveBeenNthCalledWith(6, "vetta:agent-teams:upload-avatar");
	});
});
