// @vitest-environment jsdom

import { createStore } from "jotai";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sse = vi.hoisted(() => ({
	disconnect: vi.fn(),
	connect: vi.fn(),
	onStateChange: vi.fn(() => () => undefined),
}));

vi.mock("@shared/lib/sse-client", () => ({
	createSSEClient: () => sse,
}));

import { authTokenAtom, authUserAtom, cloudLogoutAtom, remoteProvidersAtom } from "./auth-atoms";

describe("cloudLogoutAtom", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				auth: {
					signOut: vi.fn(async () => ({ revoked: true })),
				},
			},
		});
	});

	it("清空登录态、通知服务端并断开 SSE，但不触碰与本地会话相关的状态", async () => {
		const store = createStore();
		store.set(authTokenAtom, "access-token");
		store.set(authUserAtom, {
			id: 1,
			username: "u",
			nickname: "n",
			avatar: "",
		});
		store.set(remoteProvidersAtom, { vetta: {} });

		store.set(cloudLogoutAtom);

		expect(store.get(authTokenAtom)).toBeNull();
		expect(store.get(authUserAtom)).toBeNull();
		expect(store.get(remoteProvidersAtom)).toEqual({});
		expect(sse.disconnect).toHaveBeenCalledOnce();
		await vi.waitFor(() => {
			expect(window.vetta.auth.signOut).toHaveBeenCalledOnce();
		});
	});

	it("主进程登出失败时仍然清除本地登录态", async () => {
		vi.mocked(window.vetta.auth.signOut).mockRejectedValueOnce(new Error("network down"));
		const store = createStore();
		store.set(authTokenAtom, "signed-in");

		store.set(cloudLogoutAtom);

		expect(store.get(authTokenAtom)).toBeNull();
		await vi.waitFor(() => {
			expect(window.vetta.auth.signOut).toHaveBeenCalledOnce();
		});
	});
});
