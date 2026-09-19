import { describe, expect, it } from "vitest";
import { createAgentProfileFixture } from "../src/fixtures.js";
import {
	parseAgentProfileDocument,
	parseCreateAgentProfileInput,
	parseDeleteAgentProfileInput,
	parseUpdateAgentProfileInput,
} from "../src/validation.js";

describe("Agent Profile IPC input validation", () => {
	it("accepts complete profile inputs", () => {
		expect(
			parseCreateAgentProfileInput({
				name: "Researcher",
				mentionHandle: "researcher",
				blueprintId: "researcher",
				abilities: { skills: ["search"] },
			}),
		).toMatchObject({ name: "Researcher", mentionHandle: "researcher" });
	});

	it("accepts file-defined identities when they provide their own system prompt", () => {
		const document = createAgentProfileFixture();
		const first = document.agents[0];
		if (!first) throw new Error("Expected an initial agent");

		const parsed = parseAgentProfileDocument({
			...document,
			agents: [
				{ ...first, blueprintId: "custom-coordinator", systemPrompt: "Coordinate this team." },
				...document.agents.slice(1),
			],
		});

		expect(parsed.agents[0]).toMatchObject({ blueprintId: "custom-coordinator" });
	});

	it("rejects leftover team document fields", () => {
		const document = createAgentProfileFixture();
		expect(() => parseAgentProfileDocument({ ...document, teams: [] })).toThrow(
			"Invalid Agent Profile configuration document",
		);
	});

	it("rejects unknown properties and invalid revisions", () => {
		expect(() =>
			parseUpdateAgentProfileInput({
				expectedRevision: 0,
				name: "Agent",
				description: "",
				mentionHandle: "agent",
				abilities: { skills: [], mcpServers: [], plugins: [] },
			}),
		).toThrow("Invalid update agent profile input");
		expect(() => parseDeleteAgentProfileInput({ expectedRevision: 0 })).toThrow("Invalid delete agent profile input");
	});

	it("rejects duplicate library handles", () => {
		const document = createAgentProfileFixture();
		const first = document.agents[0];
		const second = document.agents[1];
		if (!first || !second) throw new Error("Expected two agents");
		expect(() =>
			parseAgentProfileDocument({
				...document,
				agents: [first, { ...second, mentionHandle: first.mentionHandle }],
			}),
		).toThrow("Duplicate library agent handle");
	});
});
