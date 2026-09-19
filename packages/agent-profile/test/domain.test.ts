import { describe, expect, it } from "vitest";
import { listLibraryAgentProfiles, normalizeMentionHandle } from "../src/domain.js";
import { createAgentProfileFixture } from "../src/fixtures.js";

describe("Agent Profile domain", () => {
	it("normalizes Unicode handles", () => {
		expect(normalizeMentionHandle(" @Ｒｅｓｅａｒｃｈｅｒ ")).toBe("researcher");
	});

	it("lists every profile in the document", () => {
		const document = createAgentProfileFixture();
		expect(listLibraryAgentProfiles(document)).toEqual(document.agents);
	});
});
