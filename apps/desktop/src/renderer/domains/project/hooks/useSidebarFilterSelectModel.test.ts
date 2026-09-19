// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSATION_FILTER_OPTIONS } from "./useSidebarFilterSelectModel";

describe("default conversation source options", () => {
	it("keeps ordinary conversations and Claw as the only source filters", () => {
		expect(DEFAULT_CONVERSATION_FILTER_OPTIONS.map((option) => option.value)).toEqual(["conversation", "claw"]);
	});
});
