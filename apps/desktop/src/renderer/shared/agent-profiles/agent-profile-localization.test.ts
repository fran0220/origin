// @vitest-environment jsdom

import type { AgentProfile, AgentProfileDocument } from "@origin/agent-profile";
import { describe, expect, it } from "vitest";
import { localizeAgentProfileDocument } from "./agent-profile-localization";

const catalogs = {
	"preset-agent": {
		defaultLocale: "zh",
		locales: {
			zh: { "agent.researcher.name": "检索员" },
			en: {
				"agent.researcher.name": "Researcher",
				"agent.researcher.description": "Gathers facts and verifies them.",
			},
		},
	},
};

function agent(overrides: Partial<AgentProfile> = {}): AgentProfile {
	return {
		id: "researcher",
		revision: 1,
		name: "检索员",
		description: "收集事实并逐条核实。",
		mentionHandle: "researcher",
		blueprintId: "plugin:preset-agent:researcher",
		abilities: { selectionMode: "all", skills: [], mcpServers: [], plugins: [] },
		scope: { kind: "library" },
		source: {
			kind: "plugin",
			pluginId: "preset-agent",
			nameKey: "agent.researcher.name",
			descriptionKey: "agent.researcher.description",
		},
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	};
}

function document(agents: AgentProfile[]): AgentProfileDocument {
	return { schemaVersion: 1, revision: 1, agents };
}

describe("localizeAgentProfileDocument", () => {
	it("follows the interface language for plugin-provided agents", () => {
		const localized = localizeAgentProfileDocument(document([agent()]), "en", catalogs);

		expect(localized.agents[0]?.name).toBe("Researcher");
		expect(localized.agents[0]?.description).toBe("Gathers facts and verifies them.");
	});

	it("keeps the stored default-locale literal when the catalog lacks an entry", () => {
		const localized = localizeAgentProfileDocument(
			document([agent({ source: { kind: "plugin", pluginId: "preset-agent", nameKey: "agent.missing.name" } })]),
			"en",
			catalogs,
		);

		expect(localized.agents[0]?.name).toBe("检索员");
	});

	it("returns the same document when nothing is localizable, so downstream memos stay stable", () => {
		const own = agent({ id: "mine", name: "我的助手", source: undefined });
		const unloaded = agent({ source: { kind: "plugin", pluginId: "not-loaded", nameKey: "agent.researcher.name" } });
		const input = document([own, unloaded]);

		expect(localizeAgentProfileDocument(input, "en", catalogs)).toBe(input);
	});
});
