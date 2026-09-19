// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ToolCallBlock } from "@shared/store/atoms";
import { describe, expect, it, vi } from "vitest";

vi.mock("../blocks/ToolCallBlock", () => ({
	ToolCallBlockView: ({ block }: { block: ToolCallBlock }) => (
		<div data-testid="tool-call">{block.toolName}</div>
	),
}));

import { ToolCallPresentation } from "./ToolCallPresentation";

describe("ToolCallPresentation", () => {
	it("renders tool details without retired team member activity", () => {
		const block: ToolCallBlock = {
			type: "tool_call",
			toolCallId: "tool-1",
			toolName: "create_thread",
			args: {},
			status: "success",
		};
		render(
			<ToolCallPresentation
				block={block}
				presentation={{
					toolCallId: "tool-1",
					activities: [],
				}}
			/>,
		);

		expect(screen.getByTestId("tool-call").textContent).toBe("create_thread");
		expect(screen.queryByTestId("member-result")).toBeNull();
	});
});
