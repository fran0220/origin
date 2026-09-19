import { describe, expect, it } from "vitest";
import { createAgentProfileFixture, createEmptyAgentProfileDocument, INITIAL_AGENT_PROFILES } from "../src/index.js";

describe("Agent Profile fixtures", () => {
	it("builds a document of library profiles", () => {
		const document = createAgentProfileFixture();

		expect(document.agents).toHaveLength(INITIAL_AGENT_PROFILES.length);
		expect(document.agents.every((agent) => agent.abilities.selectionMode === "all")).toBe(true);
		expect(document.agents.every((agent) => !agent.id.includes(":"))).toBe(true);
		expect(document.agents.every((agent) => agent.scope.kind === "library")).toBe(true);
	});

	it("carries no provider stamp, so it stands for user-owned resources", () => {
		const document = createAgentProfileFixture();
		expect(document.agents.every((agent) => agent.source === undefined)).toBe(true);
	});

	it("exports an empty document", () => {
		expect(createEmptyAgentProfileDocument()).toEqual({
			schemaVersion: 1,
			revision: 0,
			agents: [],
		});
	});
});
