import type { AgentProfile } from "@origin/agent-profile";
import { pluginBlueprintId } from "@origin/agent-profile";
import type { RegisteredNewSessionContext } from "@shared/store/plugin-atoms";
import { describe, expect, it } from "vitest";
import { resolveNewSessionContexts } from "./new-session-context-activation";

function contribution(overrides: Partial<RegisteredNewSessionContext> = {}): RegisteredNewSessionContext {
	return {
		pluginId: "origin-ui-design",
		pluginName: "Origin 设计",
		contextId: "origin-ui-design:design-resources",
		label: "设计资源",
		activateWhen: { agents: ["designer"] },
		width: "input",
		render: () => null,
		order: 0,
		canReadDraft: true,
		...overrides,
	};
}

function agent(blueprintId: string, id = "agent-1"): AgentProfile {
	return {
		id,
		revision: 1,
		name: "设计师",
		description: "",
		mentionHandle: "designer",
		blueprintId,
		abilities: { selectionMode: "all", skills: [], mcpServers: [], plugins: [] },
		scope: { kind: "library" },
		createdAt: 0,
		updatedAt: 0,
	};
}

const DESIGNER_BLUEPRINT = pluginBlueprintId("origin-ui-design", "designer");

describe("new session context activation", () => {
	it("activates when the selected agent is one the plugin contributed", () => {
		const active = resolveNewSessionContexts({
			contributions: [contribution()],
			targetAgent: agent(DESIGNER_BLUEPRINT),
		});

		expect(active).toHaveLength(1);
		expect(active[0]?.strength).toBe("target");
		expect(active[0]?.targetContributedId).toBe("designer");
	});

	it("stays hidden for an unrelated agent", () => {
		expect(resolveNewSessionContexts({ contributions: [contribution()], targetAgent: agent("master") })).toEqual([]);
	});

	it("cannot be activated by another plugin's agent", () => {
		const hijacker = contribution({
			pluginId: "some-other-plugin",
			contextId: "some-other-plugin:hijack",
			activateWhen: { agents: ["designer"] },
		});

		expect(resolveNewSessionContexts({ contributions: [hijacker], targetAgent: agent(DESIGNER_BLUEPRINT) })).toEqual(
			[],
		);
	});

	it("activates on a mentioned skill and reports which ones matched", () => {
		const active = resolveNewSessionContexts({
			contributions: [contribution({ activateWhen: { skills: ["origin-ui-design"] } })],
			mentionedSkills: ["origin-ui-design", "something-else"],
		});

		expect(active).toHaveLength(1);
		expect(active[0]?.strength).toBe("mention");
		expect(active[0]?.mentionedSkills).toEqual(["origin-ui-design"]);
	});

	it("orders the selected target's plugin ahead of a merely mentioned one", () => {
		const byTarget = contribution();
		const byMention = contribution({
			pluginId: "another-plugin",
			contextId: "another-plugin:notes",
			activateWhen: { skills: ["notes"] },
		});

		const active = resolveNewSessionContexts({
			contributions: [byMention, byTarget],
			targetAgent: agent(DESIGNER_BLUEPRINT),
			mentionedSkills: ["notes"],
		});

		expect(active.map((entry) => entry.contribution.contextId)).toEqual([
			"origin-ui-design:design-resources",
			"another-plugin:notes",
		]);
	});

	it("keeps one plugin's several tabs adjacent and in registration order", () => {
		const first = contribution({ contextId: "origin-ui-design:a", order: 0 });
		const second = contribution({ contextId: "origin-ui-design:b", order: 1 });

		const active = resolveNewSessionContexts({
			contributions: [second, first],
			targetAgent: agent(DESIGNER_BLUEPRINT),
		});

		expect(active.map((entry) => entry.contribution.contextId)).toEqual(["origin-ui-design:a", "origin-ui-design:b"]);
	});
});
