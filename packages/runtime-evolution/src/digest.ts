import { REFINEMENT_EVENT_DIGEST_DOMAIN } from "./constants.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function canonicalizeJson(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonicalizeJson);
	}
	if (!isPlainObject(value)) {
		return value;
	}
	const keys = Object.keys(value).sort();
	const next: Record<string, unknown> = {};
	for (const key of keys) {
		const nested = value[key];
		if (nested === undefined) continue;
		next[key] = canonicalizeJson(nested);
	}
	return next;
}

export function stableJson(value: unknown): string {
	return JSON.stringify(canonicalizeJson(value));
}

function toHex(bytes: Uint8Array): string {
	let hex = "";
	for (const byte of bytes) {
		hex += byte.toString(16).padStart(2, "0");
	}
	return hex;
}

export async function sha256Hex(payload: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", payload);
	return toHex(new Uint8Array(digest));
}

export async function digestRefinementPayload(payload: unknown): Promise<string> {
	const encoder = new TextEncoder();
	const domain = encoder.encode(REFINEMENT_EVENT_DIGEST_DOMAIN);
	const body = encoder.encode(stableJson(payload));
	const combined = new Uint8Array(domain.length + body.length);
	combined.set(domain, 0);
	combined.set(body, domain.length);
	const hex = await sha256Hex(combined);
	return `sha256:${hex}`;
}

export function isSha256Digest(value: string): boolean {
	return /^sha256:[0-9a-f]{64}$/.test(value);
}
