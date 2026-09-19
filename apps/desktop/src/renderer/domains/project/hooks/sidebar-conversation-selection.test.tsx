// @vitest-environment jsdom
import { runningSessionPathsAtom, sessionContextMenuAtom } from "@shared/store/atoms";
import { createStore, Provider } from "jotai";
import type { PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SidebarConversationInfo } from "../services/sidebar-conversation-projection";
import { useDefaultSessionListModel } from "./useDefaultSessionListModel";
import { useProjectGroupModel } from "./useProjectGroupModel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { language: "zh" } }),
}));

const ordinarySession: SidebarConversationInfo = {
	kind: "conversation",
	id: "ordinary-session",
	path: "C:/sessions/ordinary.jsonl",
	cwd: "C:/project",
	firstMessage: "Continue unfinished work",
	modifiedAt: 2,
};

const otherSession: SidebarConversationInfo = {
	kind: "conversation",
	id: "other-session",
	path: "C:/sessions/other.jsonl",
	cwd: "C:/project",
	firstMessage: "Other task",
	modifiedAt: 3,
};

const sessions = [ordinarySession, otherSession];
const noop = (): void => {};
const wrapper = ({ children }: PropsWithChildren): JSX.Element => <Provider>{children}</Provider>;

function runningWrapper(path: string): ({ children }: PropsWithChildren) => JSX.Element {
	const store = createStore();
	store.set(runningSessionPathsAtom, new Set([path]));
	return ({ children }: PropsWithChildren): JSX.Element => <Provider store={store}>{children}</Provider>;
}

describe("sidebar conversation selection", () => {
	it("selects only the matching conversation in the default list", () => {
		const { result } = renderHook(
			() =>
				useDefaultSessionListModel({
					activeSessionPath: ordinarySession.path,
					cwd: ordinarySession.cwd,
					filter: "conversation",
					onRenameSession: noop,
					onSelectSession: noop,
					sessions,
				}),
			{ wrapper },
		);

		expect(result.current.sessions.filter((session) => session.active).map((session) => session.key)).toEqual([
			`conversation:${ordinarySession.path}`,
		]);
	});

	it("selects only the matching conversation inside a project", () => {
		const { result } = renderHook(
			() =>
				useProjectGroupModel({
					activeSessionPath: ordinarySession.path,
					isExpanded: true,
					onCollapse: noop,
					onExpand: noop,
					onNavigateProject: noop,
					onNewSession: noop,
					onRenameSession: noop,
					onSelectSession: noop,
					project: { cwd: ordinarySession.cwd, name: "OpenVetta", sessionCount: sessions.length, type: "normal" },
					sessions,
				}),
			{ wrapper },
		);

		expect(result.current.sessionViews.filter((session) => session.active).map((session) => session.key)).toEqual([
			`conversation:${ordinarySession.path}`,
		]);
	});

	it("marks conversations as running in both sidebar placements", () => {
		const defaultList = renderHook(
			() =>
				useDefaultSessionListModel({
					activeSessionPath: "",
					cwd: ordinarySession.cwd,
					filter: "conversation",
					onRenameSession: noop,
					onSelectSession: noop,
					sessions: [ordinarySession],
				}),
			{ wrapper: runningWrapper(ordinarySession.path) },
		);
		const projectList = renderHook(
			() =>
				useProjectGroupModel({
					activeSessionPath: "",
					isExpanded: true,
					onCollapse: noop,
					onExpand: noop,
					onNavigateProject: noop,
					onNewSession: noop,
					onRenameSession: noop,
					onSelectSession: noop,
					project: { cwd: ordinarySession.cwd, name: "OpenVetta", sessionCount: 1, type: "normal" },
					sessions: [ordinarySession],
				}),
			{ wrapper: runningWrapper(ordinarySession.path) },
		);

		expect(defaultList.result.current.sessions[0]?.running).toBe(true);
		expect(projectList.result.current.sessionViews[0]?.running).toBe(true);
	});

	it("opens a mutable context menu from the default conversation list", () => {
		const store = createStore();
		const { result } = renderHook(
			() =>
				useDefaultSessionListModel({
					activeSessionPath: "",
					cwd: ordinarySession.cwd,
					filter: "conversation",
					onRenameSession: noop,
					onSelectSession: noop,
					sessions: [ordinarySession],
				}),
			{ wrapper: ({ children }) => <Provider store={store}>{children}</Provider> },
		);
		act(() =>
			result.current.actions.openContextMenu(
				{ clientX: 24, clientY: 36 } as React.MouseEvent,
				ordinarySession,
			),
		);

		expect(store.get(sessionContextMenuAtom)).toEqual({
			x: 24,
			y: 36,
			session: ordinarySession,
			allowMutations: true,
			canTag: true,
		});
	});

	it("opens a project context menu that cannot tag", () => {
		const store = createStore();
		const { result } = renderHook(
			() =>
				useProjectGroupModel({
					activeSessionPath: "",
					isExpanded: true,
					onCollapse: noop,
					onExpand: noop,
					onNavigateProject: noop,
					onNewSession: noop,
					onRenameSession: noop,
					onSelectSession: noop,
					project: { cwd: ordinarySession.cwd, name: "OpenVetta", sessionCount: 1, type: "normal" },
					sessions: [ordinarySession],
				}),
			{ wrapper: ({ children }) => <Provider store={store}>{children}</Provider> },
		);
		const preventDefault = vi.fn();

		act(() =>
			result.current.actions.openSessionContextMenu(
				{ clientX: 48, clientY: 72, preventDefault } as unknown as React.MouseEvent,
				ordinarySession,
			),
		);

		expect(preventDefault).toHaveBeenCalledOnce();
		expect(store.get(sessionContextMenuAtom)).toEqual({
			x: 48,
			y: 72,
			session: ordinarySession,
			allowMutations: true,
			canTag: false,
		});
	});

	it("renames a conversation through the ordinary rename callback", () => {
		const onRenameSession = vi.fn();
		const { result } = renderHook(
			() =>
				useDefaultSessionListModel({
					activeSessionPath: "",
					cwd: ordinarySession.cwd,
					filter: "conversation",
					onRenameSession,
					onSelectSession: noop,
					sessions: [ordinarySession],
				}),
			{ wrapper },
		);

		act(() => result.current.actions.rename(ordinarySession, "Renamed thread"));
		expect(onRenameSession).toHaveBeenCalledWith(ordinarySession.cwd, ordinarySession.path, "Renamed thread");
	});
});
