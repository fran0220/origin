import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { ConversationMessageSchema } from "../src/conversation/record-schema.js";

function toolResult(overrides: Record<string, unknown> = {}) {
	return {
		role: "toolResult",
		toolCallId: "call_1",
		toolName: "bash",
		content: [{ type: "text", text: "ok" }],
		isError: false,
		timestamp: 1,
		...overrides,
	};
}

describe("toolResult executionId compatibility", () => {
	it("accepts historical tool results without executionId", () => {
		expect(Value.Check(ConversationMessageSchema, toolResult())).toBe(true);
	});

	it("accepts an additive executionId reference", () => {
		expect(Value.Check(ConversationMessageSchema, toolResult({ executionId: "exec_1" }))).toBe(true);
	});

	it("rejects a blank executionId", () => {
		expect(Value.Check(ConversationMessageSchema, toolResult({ executionId: "" }))).toBe(false);
	});
});
