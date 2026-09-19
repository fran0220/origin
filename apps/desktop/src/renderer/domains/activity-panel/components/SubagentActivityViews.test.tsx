// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BackgroundTasksTabPanelView } from "@vetta-org/theme-ui/activity";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

describe("Subagent activity views", () => {
	it("renders concise objective, live progress, usage, and classified errors", () => {
		const html = renderToStaticMarkup(
			<BackgroundTasksTabPanelView
				items={[
					{
						kind: "subagent",
						id: "child-1",
						agentType: "general",
						taskName: "api_contract",
						path: "/root/api_contract",
						status: "failed",
						taskPreview: "Verify the public API contract.",
						errorLabel: "Connection interrupted",
						errorDetail: "The model endpoint timed out.",
						progressLabel: "2/3",
						usageLabel: "1.3K tokens · $0.004",
						statusIcon: "icon-[solar--danger-circle-linear]",
						statusLabel: "Failed",
						statusClassName: "text-destructive",
						durationLabel: "12s",
					},
				]}
				emptyLabel="No tasks"
				clearFinishedLabel={null}
				onClearFinished={vi.fn()}
				stopLabel="Stop"
				onStop={vi.fn()}
			/>,
		);

		expect(html).toContain("Verify the public API contract.");
		expect(html).toContain("1.3K tokens · $0.004");
		expect(html).toContain("Connection interrupted");
		expect(html).toContain("break-words");
	});

	it("renders and cancels an active MCP protocol Task without presenting it as bash work", () => {
		const onStop = vi.fn();
		render(
			<BackgroundTasksTabPanelView
				items={[
					{
						kind: "mcp",
						id: "mcp-record-1",
						serverName: "notion",
						toolName: "export",
						status: "input_required",
						statusMessage: "Waiting for approval",
						statusIcon: "icon-[solar--question-circle-linear]",
						statusLabel: "Waiting for input",
						statusClassName: "text-amber-400",
						durationLabel: "12s",
					},
				]}
				emptyLabel="No tasks"
				clearFinishedLabel={null}
				onClearFinished={vi.fn()}
				stopLabel="Stop"
				onStop={onStop}
			/>,
		);

		expect(screen.getByText(/notion: export/u)).toBeDefined();
		expect(screen.getByText("Waiting for approval")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: "Stop" }));
		expect(onStop).toHaveBeenCalledWith("mcp-record-1", "mcp");
	});

});
