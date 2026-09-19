import { afterEach, describe, expect, it, vi } from "vitest";

const handle = vi.fn();
const removeHandler = vi.fn();
const readDesktopConfig = vi.fn();

vi.mock("electron", () => ({
	ipcMain: {
		handle: (...args: unknown[]) => handle(...args),
		removeHandler: (...args: unknown[]) => removeHandler(...args),
	},
}));

vi.mock("../config/desktop-config-store.js", () => ({
	DEFAULT_CONVERSATION_CWD: "/tmp/home",
	readDesktopConfig: () => readDesktopConfig(),
}));

describe("project identity IPC", () => {
	afterEach(() => {
		handle.mockReset();
		removeHandler.mockReset();
		readDesktopConfig.mockReset();
	});

	it("rejects relative cwd before calling the host resolver", async () => {
		const { registerProjectIdentityIpc } = await import("./project-identity.js");
		registerProjectIdentityIpc();
		expect(handle).toHaveBeenCalledWith("vetta:project:resolve", expect.any(Function));
		const handler = handle.mock.calls[0]?.[1] as (event: unknown, cwd: unknown) => Promise<unknown>;
		await expect(handler({}, "relative/game")).rejects.toThrow(/absolute path/);
		expect(readDesktopConfig).not.toHaveBeenCalled();
	});

	it("resolves an archived project through the real identity service", async () => {
		readDesktopConfig.mockResolvedValue({
			projects: [],
			archivedProjects: [{ path: "/tmp/harbour-run" }],
		});
		const { registerProjectIdentityIpc } = await import("./project-identity.js");
		const dispose = registerProjectIdentityIpc();
		const handler = handle.mock.calls[0]?.[1] as (event: unknown, cwd: unknown) => Promise<unknown>;
		await expect(handler({}, "/tmp/harbour-run/")).resolves.toEqual({
			cwd: "/tmp/harbour-run",
			evaluationScope: { kind: "project", projectKey: "d2e9b71ff7091d76" },
			checkpointProjectKey: Buffer.from("/tmp/harbour-run").toString("base64url"),
			recordingProjectKey: "d2e9b71ff7091d76",
		});
		dispose();
		expect(removeHandler).toHaveBeenCalledWith("vetta:project:resolve");
	});
});
