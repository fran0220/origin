import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerQuickPanelIpc } from "./quickpanel.js";

const ipc = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));
const mocks = vi.hoisted(() => ({
	listSessions: vi.fn(async (): Promise<unknown[]> => []),
	showMainWindow: vi.fn(() => ({
		isDestroyed: () => false,
		webContents: { send: vi.fn() },
	})),
	hideQuickPanelWindow: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => ipc.handlers.set(channel, handler),
		removeHandler: vi.fn(),
	},
}));

vi.mock("../runtime.js", () => ({ getSharedRuntime: () => ({ listSessions: mocks.listSessions }) }));
vi.mock("../shortcuts/shortcut-service.js", () => ({
	getDesktopShortcutService: () => ({ getQuickPanelSettings: vi.fn() }),
	syncQuickPanelTrigger: vi.fn(),
}));
vi.mock("../notifications/notification-service.js", () => ({
	NOTIFICATION_NAVIGATE_CHANNEL: "notification:navigate",
}));
vi.mock("../quickpanel-trigger.js", () => ({ stopQuickPanelTrigger: vi.fn() }));
vi.mock("../quickpanel-window.js", () => ({ hideQuickPanelWindow: mocks.hideQuickPanelWindow }));
vi.mock("../window-manager.js", () => ({ getMainWindow: vi.fn(), showMainWindow: mocks.showMainWindow }));
vi.mock("./fs.js", () => ({
	DEFAULT_CONVERSATION_CWD: "C:/default",
	DEFAULT_CONVERSATION_SESSION_DIR: "C:/sessions",
}));

describe("Quick Panel recent conversations", () => {
	beforeEach(() => {
		ipc.handlers.clear();
		vi.clearAllMocks();
	});

	it("lists recent Conversations from the runtime catalog", async () => {
		const ordinary = {
			id: "ordinary",
			path: "C:/sessions/ordinary.jsonl",
			cwd: "C:/workspace",
			name: "Ordinary",
			firstMessage: "hello",
			lastMessagePreview: "world",
			modifiedAt: 2,
		};
		mocks.listSessions.mockResolvedValue([ordinary]);
		registerQuickPanelIpc();
		const listRecent = ipc.handlers.get("vetta:quickpanel:list-recent");
		if (!listRecent) throw new Error("list-recent handler was not registered");

		await expect(listRecent({}, 8)).resolves.toEqual([
			{
				sessionPath: ordinary.path,
				cwd: ordinary.cwd,
				title: ordinary.name,
				modifiedAt: ordinary.modifiedAt,
				lastMessagePreview: ordinary.lastMessagePreview,
			},
		]);
	});

	it("opens a selected Conversation in the main window", async () => {
		registerQuickPanelIpc();
		const openSession = ipc.handlers.get("vetta:quickpanel:open-session");
		if (!openSession) throw new Error("open-session handler was not registered");

		await expect(
			openSession({}, { sessionPath: "C:/sessions/chat.jsonl", cwd: "C:/workspace" }),
		).resolves.toBeUndefined();
		expect(mocks.showMainWindow).toHaveBeenCalledOnce();
		expect(mocks.hideQuickPanelWindow).toHaveBeenCalledOnce();
	});
});
