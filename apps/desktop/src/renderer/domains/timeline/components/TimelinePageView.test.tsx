// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MainlineCheckpoint } from "@origin/runtime-checkpoints";
import { TimelinePageView } from "./TimelinePageView";

vi.mock("@origin-org/ui/git-graph", () => ({
	GitGraphCanvas: ({ onSelect }: { onSelect: (hash: string) => void }) => (
		<button type="button" onClick={() => onSelect("aaa")}>
			graph
		</button>
	),
}));

const labels = {
	title: "时间线",
	subtitle: "每个 Turn 完成后自动留下可回退的检查点",
	emptyTitle: "还没有检查点",
	emptyDesc: "完成一轮对话后，这里会自动出现对应的检查点。",
	revert: "回退文件",
	rerun: "重新验证",
	conversationHint: "对话回退请在会话里单独操作，不会改文件。",
	intent: "意图",
	commit: "提交",
	files: "文件",
	verification: "验证",
	error: "错误",
	noVerification: "未配置验证命令，落地后直接保留。",
	revertTitle: "回退这个检查点？",
	revertBody: "会恢复该检查点之前的文件，并追加一次新提交，不会改写历史。",
	phase: { verifying: "验证中", reverting: "回退中", settled: "已落地", failed: "失败" },
	decision: { kept: "保留", reverted: "已回退" },
};

const kept: MainlineCheckpoint = {
	recordType: "checkpoint.mainline",
	schemaVersion: 1,
	id: "cp_1",
	operationId: "turn:s:t1",
	projectKey: "home",
	sessionId: "s",
	turnId: "t1",
	intent: "Turn completed",
	createdAt: 1,
	updatedAt: 1,
	verification: [{ command: "false", cwd: "/tmp", state: { state: "settled", executionId: "e1", outcome: { kind: "exited", code: 1 } } }],
	phase: "settled",
	decision: "kept",
	landed: { commit: "aaa", parent: null, paths: ["README.md"], added: 1, removed: 0 },
};

describe("TimelinePageView", () => {
	it("shows empty state when there are no checkpoints", () => {
		render(
			<TimelinePageView
				loading={false}
				error={undefined}
				checkpoints={[]}
				graph={{ nodes: [], feedbackEdges: [] }}
				selected={undefined}
				labels={labels}
				canRevert={false}
				canRerun={false}
				onSelect={vi.fn()}
				onRevert={vi.fn()}
				onRerun={vi.fn()}
			/>,
		);
		expect(screen.getByText("还没有检查点")).toBeTruthy();
	});

	it("lets the user revert a kept checkpoint after verification failed", async () => {
		const onRevert = vi.fn();
		const user = userEvent.setup();
		render(
			<TimelinePageView
				loading={false}
				error={undefined}
				checkpoints={[kept]}
				graph={{ nodes: [{ hash: "aaa", parents: [], checkpointId: "cp_1", projectKey: "home", subject: "Turn completed" }], feedbackEdges: [] }}
				selected={kept}
				labels={labels}
				canRevert
				canRerun
				onSelect={vi.fn()}
				onRevert={onRevert}
				onRerun={vi.fn()}
			/>,
		);
		expect(screen.getByText("Turn completed")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "回退文件" }));
		expect(onRevert).toHaveBeenCalled();
	});
});
