import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
	consumeAuthorizationCallback,
	createPkceAuthorizationState,
	PKCE_METHOD,
	PkceAuthorizationError,
	type PkceAuthorizationState,
	type RedeemableAuthorization,
} from "./pkce.js";

export type DesktopAuthMode = "pkce" | "legacy";

export interface DesktopAuthDiscovery {
	readonly mode: DesktopAuthMode;
	readonly authorizeUrl?: string;
	readonly tokenUrl?: string;
	readonly logoutUrl?: string;
	readonly accountUrl?: string;
}

export interface PkceTokenResponse {
	readonly accessToken: string;
	readonly refreshToken?: string;
	readonly tokenType?: string;
	readonly account?: {
		readonly id?: string;
		readonly subject?: string;
		readonly username?: string;
		readonly displayName?: string;
		readonly display_name?: string;
		readonly email?: string;
	};
}

export interface PkceLoginPages {
	readonly successHtml: string;
	readonly failureHtml: string;
}

export interface PkceLoginHandle {
	readonly redirectUri: string;
	readonly authorizeUrl: string;
	readonly cancel: () => void;
	readonly result: Promise<PkceTokenResponse>;
}

const WELL_KNOWN_PATHS = ["/.well-known/vetta-desktop-auth", "/auth/desktop-metadata"];

export async function discoverDesktopAuth(
	serverUrl: string,
	fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<DesktopAuthDiscovery> {
	const origin = originOf(serverUrl);
	for (const path of WELL_KNOWN_PATHS) {
		try {
			const response = await fetchImpl(`${origin}${path}`, {
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(3_000),
			});
			if (!response.ok) continue;
			const body = (await response.json()) as Record<string, unknown>;
			if (body.authorization_endpoint && body.token_endpoint) {
				return {
					mode: "pkce",
					authorizeUrl: String(body.authorization_endpoint),
					tokenUrl: String(body.token_endpoint),
					...(typeof body.revocation_endpoint === "string" ? { logoutUrl: body.revocation_endpoint } : {}),
					...(typeof body.account_endpoint === "string" ? { accountUrl: body.account_endpoint } : {}),
				};
			}
		} catch {
			// Discovery is best-effort; missing metadata keeps the legacy flow.
		}
	}
	return { mode: "legacy" };
}

export function startPkceLogin(options: {
	readonly authorizeUrl: string;
	readonly tokenUrl: string;
	readonly clientId?: string;
	readonly deviceName?: string;
	readonly pages?: PkceLoginPages;
	readonly fetch?: typeof globalThis.fetch;
	readonly now?: number;
	readonly openUrl?: (url: string) => Promise<void>;
}): Promise<PkceLoginHandle> {
	return new Promise((resolve, reject) => {
		const pages = options.pages ?? defaultPages();
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address() as AddressInfo;
			if (address.port < 1024) {
				server.close();
				reject(new Error("PKCE loopback bound an privileged port"));
				return;
			}
			const redirectUri = `http://127.0.0.1:${address.port}/callback`;
			const pending: RedeemableAuthorization = {
				state: createPkceAuthorizationState({ redirectUri, now: options.now }),
				redeemed: false,
			};
			const authorizeUrl = buildAuthorizeUrl(options.authorizeUrl, pending.state, {
				clientId: options.clientId ?? "desktop",
				deviceName: options.deviceName ?? defaultDeviceName(),
			});
			let settled = false;
			const result = new Promise<PkceTokenResponse>((resolveResult, rejectResult) => {
				const finish = (error: Error | undefined, value?: PkceTokenResponse) => {
					if (settled) return;
					settled = true;
					server.close();
					if (error) rejectResult(error);
					else if (value) resolveResult(value);
				};
				server.on("request", (request, response) => {
					void handleCallback(request, response, {
						pending,
						pages,
						tokenUrl: options.tokenUrl,
						fetchImpl: options.fetch ?? globalThis.fetch,
						finish,
					});
				});
				resolve({
					redirectUri,
					authorizeUrl,
					cancel: () => finish(new Error("PKCE login cancelled")),
					result: result,
				});
				void options.openUrl?.(authorizeUrl);
			});
		});
	});
}

export async function redeemAuthorizationCode(options: {
	readonly tokenUrl: string;
	readonly code: string;
	readonly verifier: string;
	readonly redirectUri: string;
	readonly fetch?: typeof globalThis.fetch;
}): Promise<PkceTokenResponse> {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const response = await fetchImpl(options.tokenUrl, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify({
			grant_type: "authorization_code",
			code: options.code,
			code_verifier: options.verifier,
			redirect_uri: options.redirectUri,
		}),
	});
	const body = (await response.json()) as Record<string, unknown>;
	if (!response.ok || typeof body.access_token !== "string") {
		const error = typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
		throw new Error(`PKCE token exchange failed (${error})`);
	}
	return {
		accessToken: body.access_token,
		...(typeof body.refresh_token === "string" ? { refreshToken: body.refresh_token } : {}),
		...(typeof body.token_type === "string" ? { tokenType: body.token_type } : {}),
		...(isRecord(body.account) ? { account: body.account as PkceTokenResponse["account"] } : {}),
	};
}

export async function revokeRemoteSession(options: {
	readonly logoutUrl: string;
	readonly refreshToken: string;
	readonly fetch?: typeof globalThis.fetch;
}): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
	const fetchImpl = options.fetch ?? globalThis.fetch;
	const response = await fetchImpl(options.logoutUrl, {
		method: "POST",
		headers: { Accept: "application/json", "Content-Type": "application/json" },
		body: JSON.stringify({ refresh_token: options.refreshToken }),
	});
	const body = await response.text();
	if (!response.ok) return { ok: false, status: response.status, body };
	return { ok: true };
}

async function handleCallback(
	request: IncomingMessage,
	response: ServerResponse,
	context: {
		readonly pending: RedeemableAuthorization;
		readonly pages: PkceLoginPages;
		readonly tokenUrl: string;
		readonly fetchImpl: typeof globalThis.fetch;
		readonly finish: (error: Error | undefined, value?: PkceTokenResponse) => void;
	},
): Promise<void> {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	if (url.pathname !== "/callback") {
		response.writeHead(404).end();
		return;
	}
	try {
		const redeemed = consumeAuthorizationCallback(context.pending, {
			state: url.searchParams.get("state"),
			code: url.searchParams.get("code"),
		});
		const tokens = await redeemAuthorizationCode({
			tokenUrl: context.tokenUrl,
			code: redeemed.code,
			verifier: redeemed.verifier,
			redirectUri: redeemed.redirectUri,
			fetch: context.fetchImpl,
		});
		response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(context.pages.successHtml);
		context.finish(undefined, tokens);
	} catch (error) {
		response.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(context.pages.failureHtml);
		context.finish(error instanceof Error ? error : new Error(String(error)));
	}
}

function buildAuthorizeUrl(
	authorizeUrl: string,
	state: PkceAuthorizationState,
	options: { readonly clientId: string; readonly deviceName: string },
): string {
	const url = new URL(authorizeUrl);
	url.searchParams.set("client", options.clientId);
	url.searchParams.set("device_name", options.deviceName);
	url.searchParams.set("redirect_uri", state.redirectUri);
	url.searchParams.set("code_challenge", state.challenge.challenge);
	url.searchParams.set("code_challenge_method", PKCE_METHOD);
	url.searchParams.set("state", state.state);
	url.searchParams.set("response_type", "code");
	return url.toString();
}

function originOf(serverUrl: string): string {
	try {
		const url = new URL(serverUrl);
		return url.origin;
	} catch {
		return serverUrl.replace(/\/+$/, "").replace(/\/api\/v\d+$/, "");
	}
}

function defaultDeviceName(): string {
	return `${process.platform}-desktop`;
}

function defaultPages(): PkceLoginPages {
	return {
		successHtml: `<!doctype html><meta charset="utf-8"><title>Vetta</title><body style="font:16px system-ui;padding:48px">Authorized. You can close this window.</body>`,
		failureHtml: `<!doctype html><meta charset="utf-8"><title>Vetta</title><body style="font:16px system-ui;padding:48px">Authorization failed. You can close this window and retry in the app.</body>`,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

void PkceAuthorizationError;
