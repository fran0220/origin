import { describe, expect, it } from "vitest";
import { createAgentTeamStorageKey } from "./agent-team-storage-layout.js";

describe("Agent Profile storage layout", () => {
	it("creates readable, stable and path-safe directory keys", () => {
		expect(createAgentTeamStorageKey("深度 研究 / Review", "team-a")).toMatch(/^深度-研究-review--[a-f0-9]{10}$/u);
		expect(createAgentTeamStorageKey("CON", "..")).toMatch(/^con--[a-f0-9]{10}$/u);
		expect(createAgentTeamStorageKey("Same name", "team-a")).not.toBe(
			createAgentTeamStorageKey("Same name", "team-b"),
		);
	});
});
