import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKPOINT_IPC_CHANNELS, registerCheckpointsIpc } from "./checkpoints.js";

const ipc = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	removed: [] as string[],
}));

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: (...args: unknown[]) => unknown) => ipc.handlers.set(channel, handler),
		removeHandler: (channel: string) => ipc.removed.push(channel),
	},
}));

const service = vi.hoisted(() => ({
	list: vi.fn(async () => [{ id: "cp_1" }]),
	get: vi.fn(async () => ({ id: "cp_1" })),
	revert: vi.fn(async () => ({ id: "cp_1", decision: "reverted" })),
	rerunVerification: vi.fn(async () => ({ id: "cp_1" })),
	setPolicy: vi.fn(async (policy) => policy),
	readPolicy: vi.fn(async () => ({
		projectKey: "home",
		vcsMode: "shadow",
		verificationCommands: [],
		onVerificationFailure: "keep-for-user",
	})),
}));

vi.mock("../checkpoints/checkpoint-service.js", () => ({
	getDesktopCheckpointService: () => service,
}));

describe("Checkpoints IPC contract", () => {
	beforeEach(() => {
		ipc.handlers.clear();
		ipc.removed.length = 0;
		vi.clearAllMocks();
	});

	it("registers and tears down every channel", () => {
		const teardown = registerCheckpointsIpc();
		expect([...ipc.handlers.keys()]).toEqual(Object.values(CHECKPOINT_IPC_CHANNELS));
		teardown();
		expect(ipc.removed).toEqual(Object.values(CHECKPOINT_IPC_CHANNELS));
	});

	it("rejects blank identifiers before calling the service", async () => {
		registerCheckpointsIpc();
		const get = ipc.handlers.get(CHECKPOINT_IPC_CHANNELS.GET);
		if (!get) throw new Error("get handler missing");
		await expect(get({}, " ", "cp_1")).rejects.toThrow("checkpoints.get requires projectKey and checkpointId");
		expect(service.get).not.toHaveBeenCalled();
	});

	it("lists, reverts, and updates policy", async () => {
		registerCheckpointsIpc();
		const list = ipc.handlers.get(CHECKPOINT_IPC_CHANNELS.LIST);
		const revert = ipc.handlers.get(CHECKPOINT_IPC_CHANNELS.REVERT);
		const setPolicy = ipc.handlers.get(CHECKPOINT_IPC_CHANNELS.SET_POLICY);
		if (!list || !revert || !setPolicy) throw new Error("handlers missing");
		await expect(list({}, "home")).resolves.toEqual([{ id: "cp_1" }]);
		await expect(revert({}, "home", "cp_1")).resolves.toMatchObject({ decision: "reverted" });
		await expect(
			setPolicy(
				{},
				{
					projectKey: "home",
					vcsMode: "shadow",
					verificationCommands: ["bun test"],
					onVerificationFailure: "keep-for-user",
				},
			),
		).resolves.toMatchObject({ verificationCommands: ["bun test"] });
	});
});
