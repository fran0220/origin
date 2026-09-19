import { describe, expect, it } from "vitest";
import { createAgentProfileStorageKey } from "./agent-profile-storage-layout.js";

describe("Agent Profile storage layout", () => {
	it("creates readable, stable and path-safe directory keys", () => {
		expect(createAgentProfileStorageKey("深度 研究 / Review", "team-a")).toMatch(/^深度-研究-review--[a-f0-9]{10}$/u);
		expect(createAgentProfileStorageKey("CON", "..")).toMatch(/^con--[a-f0-9]{10}$/u);
		expect(createAgentProfileStorageKey("Same name", "team-a")).not.toBe(
			createAgentProfileStorageKey("Same name", "team-b"),
		);
	});
});
