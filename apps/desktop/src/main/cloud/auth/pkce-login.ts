import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
	consumeAuthorizationCallback,
	createPkceAuthorizationState,
	discoverDesktopAuth,
	type PkceTokenResponse,
	type RedeemableAuthorization,
	redeemAuthorizationCode,
	revokeRemoteSession,
} from "@origin/coding-agent/connections";
import { BrowserWindow } from "electron";
import { getAccountDirectoryService } from "../../connections/account-directory.js";
import { getConnectionCatalog } from "../../connections/catalog.js";
import { DEFAULT_SERVER_URL, DEFAULT_SITE_URL } from "../../constants.js";
import { writeAccountTokens } from "../../credentials/account-token-store.js";
import { getAppLogger } from "../../logger.js";
import { openExternalUrl } from "../../open-external.js";

const log = getAppLogger("auth");

export interface DesktopPkceLogin {
	readonly authorizeUrl: string;
	readonly cancel: () => void;
	readonly result: Promise<PkceTokenResponse>;
}

let active: { cancel: () => void } | undefined;

export async function startPkceOrLegacyLogin(): Promise<"pkce" | "legacy"> {
	const discovery = await discoverDesktopAuth(DEFAULT_SERVER_URL);
	if (discovery.mode !== "pkce" || !discovery.authorizeUrl || !discovery.tokenUrl) {
		return "legacy";
	}
	const login = await listenForPkceCallback({
		authorizeUrl: discovery.authorizeUrl,
		tokenUrl: discovery.tokenUrl,
	});
	active?.cancel();
	active = login;
	await openExternalUrl(login.authorizeUrl);
	void login.result
		.then((tokens) => {
			writeAccountTokens(tokens.accessToken, tokens.refreshToken);
			const origin = new URL(DEFAULT_SERVER_URL).origin;
			const account = tokens.account;
			getConnectionCatalog().upsertSignedIn({
				displayName: account?.displayName ?? account?.display_name ?? "Vetta",
				endpoint: origin,
				secret: tokens.accessToken,
				account: {
					subject: String(account?.subject ?? account?.id ?? "signed-in"),
					username: String(account?.username ?? "signed-in"),
					displayName: String(account?.displayName ?? account?.display_name ?? "Vetta"),
					...(account?.email ? { email: account.email } : {}),
				},
			});
			getAccountDirectoryService().admit(origin, String(account?.subject ?? account?.id ?? "signed-in"), origin);
			void import("../../connections/runtime-binding.js")
				.then(({ bindModelRuntimeToConnectionRelays }) => bindModelRuntimeToConnectionRelays())
				.then(() => {
					for (const win of BrowserWindow.getAllWindows()) {
						if (!win.isDestroyed()) win.webContents.send("origin:auth:oauth-callback", { signedIn: true });
					}
				});
		})
		.catch((error: unknown) => {
			log.warn("PKCE login failed");
			for (const win of BrowserWindow.getAllWindows()) {
				if (!win.isDestroyed()) win.webContents.send("origin:auth:oauth-rejected");
			}
			void error;
		});
	return "pkce";
}

export function cancelActivePkceLogin(): void {
	active?.cancel();
	active = undefined;
}

export async function waitActivePkceLogin(): Promise<PkceTokenResponse | undefined> {
	return undefined;
}

export function logoutUrlFromDiscovery(discoveryLogout?: string): string {
	return discoveryLogout ?? `${DEFAULT_SERVER_URL.replace(/\/+$/, "")}/auth/logout`;
}

export { discoverDesktopAuth, revokeRemoteSession };

function listenForPkceCallback(options: {
	readonly authorizeUrl: string;
	readonly tokenUrl: string;
}): Promise<DesktopPkceLogin> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address() as AddressInfo;
			if (address.port < 1024) {
				server.close();
				reject(new Error("PKCE loopback bound a privileged port"));
				return;
			}
			const redirectUri = `http://127.0.0.1:${address.port}/callback`;
			const pending: RedeemableAuthorization = {
				state: createPkceAuthorizationState({ redirectUri }),
				redeemed: false,
			};
			const authorizeUrl = buildAuthorizeUrl(options.authorizeUrl, pending, redirectUri);
			let settled = false;
			const result = new Promise<PkceTokenResponse>((resolveResult, rejectResult) => {
				const finish = (error: Error | undefined, value?: PkceTokenResponse) => {
					if (settled) return;
					settled = true;
					server.close();
					active = undefined;
					if (error) rejectResult(error);
					else if (value) resolveResult(value);
				};
				server.on("request", (request, response) => {
					void handleCallback(request, response, pending, options.tokenUrl, finish);
				});
				resolve({
					authorizeUrl,
					cancel: () => finish(new Error("PKCE login cancelled")),
					result,
				});
			});
		});
	});
}

async function handleCallback(
	request: IncomingMessage,
	response: ServerResponse,
	pending: RedeemableAuthorization,
	tokenUrl: string,
	finish: (error: Error | undefined, value?: PkceTokenResponse) => void,
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	if (url.pathname !== "/callback") {
		response.writeHead(404).end();
		return;
	}
	try {
		const redeemed = consumeAuthorizationCallback(pending, {
			state: url.searchParams.get("state"),
			code: url.searchParams.get("code"),
		});
		const tokens = await redeemAuthorizationCode({
			tokenUrl,
			code: redeemed.code,
			verifier: redeemed.verifier,
			redirectUri: redeemed.redirectUri,
		});
		response
			.writeHead(200, { "content-type": "text/html; charset=utf-8" })
			.end(
				`<!doctype html><meta charset="utf-8"><title>Vetta</title><body style="font:16px system-ui;padding:48px">Authorized. You can close this window.</body>`,
			);
		finish(undefined, tokens);
	} catch (error) {
		log.warn("PKCE callback refused");
		response
			.writeHead(400, { "content-type": "text/html; charset=utf-8" })
			.end(
				`<!doctype html><meta charset="utf-8"><title>Vetta</title><body style="font:16px system-ui;padding:48px">Authorization failed. You can close this window and retry in the app.</body>`,
			);
		finish(error instanceof Error ? error : new Error(String(error)));
	}
}

function buildAuthorizeUrl(authorizeUrl: string, pending: RedeemableAuthorization, redirectUri: string): string {
	const url = new URL(authorizeUrl);
	url.searchParams.set("client", "desktop");
	url.searchParams.set("device_name", `${process.platform}-desktop`);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("code_challenge", pending.state.challenge.challenge);
	url.searchParams.set("code_challenge_method", pending.state.challenge.method);
	url.searchParams.set("state", pending.state.state);
	url.searchParams.set("response_type", "code");
	if (!url.origin) {
		return `${DEFAULT_SITE_URL}${authorizeUrl}`;
	}
	return url.toString();
}
