import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "../src/manifest.js";

const baseManifest = {
	id: "agent-roles-test",
	name: "Agent roles test",
	version: "1.0.0",
	pluginApiVersion: "^2.0.0",
	entry: "dist/index.js",
	moduleFederation: { remoteName: "agent_roles_test", expose: "./plugin" },
};

describe("plugin manifest agent roles", () => {
	it("carries the roles an agent offers to other plugins", () => {
		const manifest = parsePluginManifest({
			...baseManifest,
			agent: {
				agents: [{ id: "dev", name: "Dev", systemPrompt: "You build.", roles: ["developer", "developer"] }],
			},
		});

		// 重复的角色会让候选表里出现两份同一个人，归一化时去掉。
		expect(manifest.agent?.agents?.[0]?.roles).toEqual(["developer"]);
	});

	it("rejects retired team declarations", () => {
		expect(() =>
			parsePluginManifest({
				...baseManifest,
				agent: {
					agents: [{ id: "lead", name: "Lead", systemPrompt: "You lead." }],
					teams: [{ id: "squad", name: "Squad", members: [{ agent: "lead", responsibility: "Owns the result." }] }],
				},
			}),
		).toThrow(/Invalid plugin manifest/);
	});
});
