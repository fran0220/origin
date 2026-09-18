import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
	app: { isPackaged: true },
}));

vi.mock("../../open-external.js", () => ({
	openExternalUrl: vi.fn(),
}));

vi.mock("./oauth-loopback.js", () => ({
	ensureLoopbackCallbackUrl: vi.fn(async () => "http://127.0.0.1:9/oauth/callback"),
}));

const { consumeOAuthCallback, isOAuthCallbackUrl, startOAuthLogin } = await import("./oauth-login.js");

afterEach(() => {
	consumeOAuthCallback(new URL("origin://oauth/callback?access_token=discard&state=none"));
});

describe("OAuth callback scheme compatibility", () => {
	it("接受 origin:// 与遗留 vetta:// 回调 URL", () => {
		expect(isOAuthCallbackUrl(new URL("origin://oauth/callback?access_token=t&state=s"))).toBe(true);
		expect(isOAuthCallbackUrl(new URL("vetta://oauth/callback?access_token=t&state=s"))).toBe(true);
		expect(isOAuthCallbackUrl(new URL("https://example.com/oauth/callback?access_token=t"))).toBe(false);
	});

	it("打包后发起授权使用 origin:// 回调", async () => {
		const { openExternalUrl } = await import("../../open-external.js");
		await startOAuthLogin();
		expect(vi.mocked(openExternalUrl)).toHaveBeenCalledOnce();
		const opened = String(vi.mocked(openExternalUrl).mock.calls[0]?.[0]);
		expect(opened).toContain(encodeURIComponent("origin://oauth/callback?state="));
		expect(opened).not.toContain(encodeURIComponent("vetta://oauth/callback?state="));
	});

	it("origin:// 与 vetta:// 回调都能通过 state 校验被消费", async () => {
		const { openExternalUrl } = await import("../../open-external.js");
		vi.mocked(openExternalUrl).mockClear();
		await startOAuthLogin();
		const opened = String(vi.mocked(openExternalUrl).mock.calls[0]?.[0]);
		const authorizeUrl = new URL(opened);
		const clientRedirect = authorizeUrl.searchParams.get("client_redirect");
		expect(clientRedirect).toBeTruthy();
		const redirect = new URL(clientRedirect ?? "");
		const state = redirect.searchParams.get("state");
		expect(state).toBeTruthy();

		const originTokens = consumeOAuthCallback(
			new URL(`origin://oauth/callback?access_token=origin-token&refresh_token=r1&state=${state}`),
		);
		expect(originTokens).toEqual({ token: "origin-token", refreshToken: "r1" });

		vi.mocked(openExternalUrl).mockClear();
		await startOAuthLogin();
		const openedAgain = String(vi.mocked(openExternalUrl).mock.calls[0]?.[0]);
		const nextState = new URL(new URL(openedAgain).searchParams.get("client_redirect") ?? "").searchParams.get(
			"state",
		);
		const legacyTokens = consumeOAuthCallback(
			new URL(`vetta://oauth/callback?access_token=legacy-token&state=${nextState}`),
		);
		expect(legacyTokens).toEqual({ token: "legacy-token", refreshToken: undefined });
	});
});
