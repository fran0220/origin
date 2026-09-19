import { createHash, randomBytes } from "node:crypto";

export const PKCE_METHOD = "S256" as const;
export const AUTHORIZATION_CODE_TTL_MS = 120_000;

export interface PkceChallenge {
	readonly verifier: string;
	readonly challenge: string;
	readonly method: typeof PKCE_METHOD;
}

export interface PkceAuthorizationState {
	readonly state: string;
	readonly redirectUri: string;
	readonly challenge: PkceChallenge;
	readonly createdAt: number;
	readonly expiresAt: number;
}

export type PkceFailure = "state-mismatch" | "expired" | "already-redeemed" | "missing-code" | "redirect-mismatch";

export class PkceAuthorizationError extends Error {
	readonly code: PkceFailure;

	constructor(code: PkceFailure) {
		super(`PKCE authorization failed (${code})`);
		this.name = "PkceAuthorizationError";
		this.code = code;
	}
}

export function createPkceChallenge(entropy: () => Buffer = () => randomBytes(32)): PkceChallenge {
	const verifier = base64Url(entropy());
	const challenge = base64Url(createHash("sha256").update(verifier).digest());
	return { verifier, challenge, method: PKCE_METHOD };
}

export function createPkceAuthorizationState(options: {
	readonly redirectUri: string;
	readonly now?: number;
	readonly ttlMs?: number;
	readonly entropy?: () => Buffer;
}): PkceAuthorizationState {
	const now = options.now ?? Date.now();
	const entropy = options.entropy ?? (() => randomBytes(32));
	return {
		state: base64Url(entropy()),
		redirectUri: options.redirectUri,
		challenge: createPkceChallenge(entropy),
		createdAt: now,
		expiresAt: now + (options.ttlMs ?? AUTHORIZATION_CODE_TTL_MS),
	};
}

export interface RedeemableAuthorization {
	readonly state: PkceAuthorizationState;
	redeemed: boolean;
}

/**
 * Consume one authorization callback. State must match, the code must be
 * present, the request must not have expired, and the code may be redeemed
 * exactly once. Redirect URI is compared as an exact string.
 */
export function consumeAuthorizationCallback(
	pending: RedeemableAuthorization | null,
	callback: { readonly state: string | null; readonly code: string | null; readonly redirectUri?: string },
	now = Date.now(),
): { verifier: string; code: string; redirectUri: string } {
	if (!pending) throw new PkceAuthorizationError("state-mismatch");
	if (pending.redeemed) throw new PkceAuthorizationError("already-redeemed");
	if (callback.state !== pending.state.state) throw new PkceAuthorizationError("state-mismatch");
	if (now > pending.state.expiresAt) throw new PkceAuthorizationError("expired");
	if (!callback.code) throw new PkceAuthorizationError("missing-code");
	if (callback.redirectUri !== undefined && callback.redirectUri !== pending.state.redirectUri) {
		throw new PkceAuthorizationError("redirect-mismatch");
	}
	pending.redeemed = true;
	return {
		verifier: pending.state.challenge.verifier,
		code: callback.code,
		redirectUri: pending.state.redirectUri,
	};
}

export function base64Url(bytes: Buffer): string {
	return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
