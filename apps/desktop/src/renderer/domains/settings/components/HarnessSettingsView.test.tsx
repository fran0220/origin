// @vitest-environment jsdom

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HarnessSettingsView } from "./HarnessSettingsView";
import type { HarnessSettingsModel } from "./useHarnessSettingsModel";
import type { HarnessLedgerModel } from "./useHarnessLedgerModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { exists: () => true } }),
}));

function labels(): HarnessLedgerModel["labels"] {
	return {
		add: "新增规则",
		budget: (entries, entryLimit, bytes, byteLimit) => `${entries}/${entryLimit} · ${bytes}/${byteLimit}`,
		cancel: "取消",
		content: "内容",
		contentPlaceholder: "content",
		createTitle: "新增规则",
		delete: "删除",
		deleteConfirm: (title) => `删除 ${title}`,
		edit: "编辑",
		empty: "还没有持续规则。",
		errorPrefix: "无法更新持续规则：",
		historyEmpty: "还没有修订记录。",
		id: "标识",
		idPlaceholder: "id",
		kind: "类型",
		kindOptions: { prompt: "提示词", memory: "记忆引导", skill: "技能引导", subagent: "子代理引导" },
		loading: "正在读取持续规则…",
		promote: "提升到全局",
		promoteConfirm: (title) => `提升 ${title}`,
		revision: (revision) => `修订 ${revision}`,
		rollback: "回滚",
		rollbackConfirm: (summary) => `撤回 ${summary}`,
		save: "保存",
		saving: "保存中…",
		sectionEntries: "规则条目",
		sectionHistory: "修订历史",
		source: (source) => `来源 ${source}`,
		title: "标题",
		titlePlaceholder: "title",
		version: (version) => `v${version}`,
	};
}

function ledger(overrides: Partial<HarnessLedgerModel> = {}): HarnessLedgerModel {
	return {
		actions: {
			closeEditor: vi.fn(),
			deleteEntry: vi.fn(),
			openCreate: vi.fn(),
			openEdit: vi.fn(),
			promoteEntry: vi.fn(),
			rollbackEvent: vi.fn(),
			save: vi.fn(async () => undefined),
			updateEditor: vi.fn(),
		},
		canPromote: false,
		editor: null,
		editorError: null,
		editorOpen: false,
		editingId: null,
		entries: [
			{
				id: "always-bazel",
				kind: "prompt",
				title: "Always bazel",
				content: "This repo builds with bazel.",
				source: "refine",
				version: 1,
				createdAtMs: 1,
				updatedAtMs: 1,
			},
		],
		error: null,
		history: [
			{
				digest: "sha256:aa",
				parentDigest: null,
				scope: { kind: "global" },
				revision: 1,
				kind: "applied",
				proposal: {
					summary: "keep bazel",
					rationale: "the build used bazel",
					expectedOutcome: "later Turns start from it",
					edits: [],
				},
				applied: [],
				rejected: [],
				createdAtMs: 1,
			},
		],
		labels: labels(),
		loading: false,
		read: {
			scope: { kind: "global" },
			revision: 1,
			headDigest: "sha256:aa",
			entries: [],
			budget: { entries: 1, entryLimit: 256, bytes: 28, byteLimit: 196608 },
		},
		saving: false,
		...overrides,
	};
}

function model(overrides: Partial<HarnessSettingsModel> = {}): HarnessSettingsModel {
	return {
		title: "持续规则",
		description: "共享基线",
		ledger: ledger(),
		...overrides,
	};
}

describe("HarnessSettingsView", () => {
	it("列出当前规则并点回滚把修订交回模型", async () => {
		const rollbackEvent = vi.fn();
		const view = render(
			<HarnessSettingsView model={model({ ledger: ledger({ actions: { ...ledger().actions, rollbackEvent } }) })} />,
		);

		expect(view.getByText("持续规则")).toBeTruthy();
		expect(view.getByText("Always bazel")).toBeTruthy();
		expect(view.getByText("keep bazel")).toBeTruthy();

		await userEvent.click(view.getByRole("button", { name: "回滚" }));
		expect(rollbackEvent).toHaveBeenCalledWith(expect.objectContaining({ digest: "sha256:aa" }));
	});

	it("点新增规则打开创建入口", async () => {
		const openCreate = vi.fn();
		const view = render(
			<HarnessSettingsView model={model({ ledger: ledger({ actions: { ...ledger().actions, openCreate } }) })} />,
		);
		await userEvent.click(view.getByRole("button", { name: "新增规则" }));
		expect(openCreate).toHaveBeenCalledOnce();
	});
});
