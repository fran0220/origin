import { describe, expect, it } from "vitest";
import { freezeDialMode, normalizeDialMode } from "./dial-modes.js";

describe("DialMode", () => {
	it("defaults unknown values to medium", () => {
		expect(normalizeDialMode(undefined)).toBe("medium");
		expect(normalizeDialMode("fast")).toBe("medium");
	});

	it("freezes an existing thread mode and ignores later requests", () => {
		expect(freezeDialMode("high", "low")).toBe("high");
		expect(freezeDialMode(undefined, "ultra")).toBe("ultra");
	});
});
