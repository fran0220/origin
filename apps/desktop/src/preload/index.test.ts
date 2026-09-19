// @vitest-environment jsdom

import { expect, it, vi } from "vitest";
import type { DesktopApi } from "./api.js";

const expose = vi.hoisted(() => vi.fn<(name: string, api: DesktopApi) => void>());
vi.mock("@sentry/electron/preload-namespaced", () => ({ hookupIpc: vi.fn() }));
vi.mock("@sentry/electron/renderer", () => ({ init: vi.fn() }));
vi.mock("electron", () => ({
	contextBridge: { exposeInMainWorld: expose },
	ipcRenderer: { on: vi.fn(), send: vi.fn(), sendSync: vi.fn(() => "en"), invoke: vi.fn(), removeListener: vi.fn() },
	webUtils: { getPathForFile: vi.fn() },
}));

it("exposes the Desktop bridge without Agent configuration or diagnostic APIs", async () => {
	await import("./index.js");
	const [name, api] = expose.mock.calls[0]!;
	expect(name).toBe("originApp");
	expect(api).not.toHaveProperty("agentConfiguration");
	expect(api).not.toHaveProperty("agentTraces");
	expect(api.session.create).toBeTypeOf("function");
	expect(api.session.prompt).toBeTypeOf("function");
	expect(api.checkpoints.list).toBeTypeOf("function");
	expect(api.checkpoints.revert).toBeTypeOf("function");
	expect(api.evolution.read).toBeTypeOf("function");
	expect(api.evolution.commit).toBeTypeOf("function");
	expect(api.evolution.rollback).toBeTypeOf("function");
	expect(api.evolution.promote).toBeTypeOf("function");
	expect(api.evolution.history).toBeTypeOf("function");
});
