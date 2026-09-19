import { describe, expect, it } from "vitest";
import {
	agentTargetKey,
	CONVERSATION_TARGET_KEY,
	filterTargetOptions,
	parseAgentTargetKey,
	parseNewSessionTarget,
} from "./target";

describe("new-session targets", () => {
	it("uses conversation as the default", () => {
		expect(parseNewSessionTarget(undefined)).toBe(CONVERSATION_TARGET_KEY);
		expect(parseNewSessionTarget("conversation")).toBe(CONVERSATION_TARGET_KEY);
	});

	it("parses agent keys without treating them as conversation", () => {
		expect(parseAgentTargetKey(agentTargetKey("agent-1"))).toBe("agent-1");
		expect(parseAgentTargetKey("conversation")).toBeNull();
		expect(parseAgentTargetKey(null)).toBeNull();
	});

	it("filters target options by title and subtitle", () => {
		const options = [
			{ targetKey: agentTargetKey("a"), title: "Research", subtitle: "Find evidence", selected: false },
			{ targetKey: agentTargetKey("b"), title: "Build", selected: false },
		] as const;
		expect(filterTargetOptions(options, "FIND EVIDENCE")).toHaveLength(1);
		expect(filterTargetOptions(options, "build")[0]?.title).toBe("Build");
	});
});
