import { createAgentProfileFixture } from "@origin/agent-profile";
import { describe, expect, it } from "vitest";
import { resolveNewSessionTargetIdentity } from "./new-session-target-identity";
import { agentTargetKey } from "./target";

const labels = { memberCount: (count: number) => `${count} members` };

describe("resolveNewSessionTargetIdentity", () => {
	const document = createAgentProfileFixture();
	const agent = document.agents.find((candidate) => candidate.name === "Researcher") ?? document.agents[0];
	if (!agent) throw new Error("missing Agent Profile fixture");

	it("keeps the greeting when nothing is selected", () => {
		expect(resolveNewSessionTargetIdentity(document, null, labels)).toBeNull();
	});

	it("keeps the greeting until the catalog arrives", () => {
		expect(resolveNewSessionTargetIdentity(undefined, agentTargetKey(agent.id), labels)).toBeNull();
	});

	it("describes a single agent with its own name, description and avatar", () => {
		const identity = resolveNewSessionTargetIdentity(document, agentTargetKey(agent.id), labels);

		expect(identity?.title).toBe(agent.name);
		expect(identity?.subtitle).toBe(agent.description);
		expect(identity?.avatars).toHaveLength(1);
		expect(identity?.avatars[0]?.avatar).toBeTruthy();
	});

	it("keeps the greeting when the selected target no longer exists", () => {
		expect(resolveNewSessionTargetIdentity(document, agentTargetKey("removed"), labels)).toBeNull();
	});
});
