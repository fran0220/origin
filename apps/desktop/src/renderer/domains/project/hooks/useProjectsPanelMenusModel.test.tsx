// @vitest-environment jsdom
import { confirmDialogAtom } from "@shared/store/atoms";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectsPanelModel } from "../components/sidebar/projects/panel/types";
import { useProjectsPanelMenusModel } from "./useProjectsPanelMenusModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

// 删除确认后还要摘掉该会话的标签标注，走 preload 的 conversationTags 通道。
const forgetConversations = vi.fn();
vi.stubGlobal("window", Object.assign(globalThis.window, { originApp: { conversationTags: { forgetConversations } } }));

const conversation = {
	kind: "conversation" as const,
	id: "session",
	path: "C:/sessions/thread.jsonl",
	cwd: "C:/project",
	firstMessage: "Thread task",
	modifiedAt: 1,
};

function model(deleteSession: ReturnType<typeof vi.fn>): ProjectsPanelModel {
	return {
		defaultConversationFilter: "conversation",
		imCwd: "C:/im",
		projectSessions: () => [],
		actions: { deleteSession },
	} as unknown as ProjectsPanelModel;
}

describe("useProjectsPanelMenusModel", () => {
	it("asks for confirmation before deleting a conversation and deletes only after confirmation", () => {
		const store = createStore();
		const deleteSession = vi.fn();
		const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
		const { result } = renderHook(() => useProjectsPanelMenusModel(model(deleteSession)), { wrapper });

		act(() => result.current.actions.deleteSession(conversation));

		const confirmation = store.get(confirmDialogAtom);
		expect(deleteSession).not.toHaveBeenCalled();
		expect(confirmation).toMatchObject({
			title: "sidebar.dialogs.deleteSessionTitle",
			message: "sidebar.dialogs.deleteSessionMessage",
			confirmLabel: "sidebar.dialogs.deleteConfirm",
			variant: "danger",
		});

		act(() => confirmation?.onConfirm(false));
		expect(deleteSession).toHaveBeenCalledWith(conversation);
	});
});
