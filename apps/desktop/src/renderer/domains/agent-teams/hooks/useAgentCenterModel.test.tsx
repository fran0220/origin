// @vitest-environment jsdom

import type { AgentProfileDocument } from "@origin/agent-team";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAgentCenterModel } from "./useAgentCenterModel";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));

vi.mock("../services/load-agent-team-resources", () => ({
	loadAgentTeamConfigurationResources: mocks.load,
}));

const leader = {
	id: "designer",
	revision: 1,
	name: "设计师",
	description: "",
	mentionHandle: "designer",
	blueprintId: "plugin:vetta-ui-design:designer",
	abilities: { selectionMode: "all", skills: [], mcpServers: [], plugins: [] },
	scope: { kind: "library" },
	createdAt: 1,
	updatedAt: 1,
} as const;

describe("useAgentCenterModel", () => {
	it("loads the agent library without a persistent team roster", async () => {
		const document = { schemaVersion: 1, revision: 1, agents: [leader] };
		mocks.load.mockResolvedValue({
			document: document as unknown as AgentProfileDocument,
			blueprints: [],
			plugins: [],
			capabilities: [],
		});
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: { agentTeams: { list: vi.fn(), onChanged: () => () => {} } },
		});

		const { result } = renderHook(() => useAgentCenterModel({ defaultName: "", defaultDescription: "" }));
		await waitFor(() => expect(result.current.agents).toHaveLength(1));

		expect(result.current.findAgent("designer")?.name).toBe("设计师");
		expect("teams" in result.current).toBe(false);
	});
});
