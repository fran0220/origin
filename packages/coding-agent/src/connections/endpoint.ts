/**
 * Credential-free Connection endpoint. Secrets cannot be smuggled through
 * URL userinfo, path, query, or fragment — the value is an origin only.
 */

export const CONNECTION_ENDPOINT_MAX_LENGTH = 2048;

export type ConnectionEndpoint = string & { readonly __brand: "ConnectionEndpoint" };

export type ConnectionEndpointError =
	| "empty"
	| "too-long"
	| "whitespace"
	| "control"
	| "missing-scheme"
	| "invalid-scheme"
	| "credential-smuggle"
	| "not-origin";

export class InvalidConnectionEndpointError extends Error {
	readonly code: ConnectionEndpointError;
	readonly value: string;

	constructor(code: ConnectionEndpointError, value: string) {
		super(`connection endpoint is not a credential-free URL origin (${code})`);
		this.name = "InvalidConnectionEndpointError";
		this.code = code;
		this.value = value;
	}
}

export function parseConnectionEndpoint(value: string): ConnectionEndpoint {
	const result = tryParseConnectionEndpoint(value);
	if (!result.ok) throw new InvalidConnectionEndpointError(result.code, value);
	return result.endpoint;
}

export function tryParseConnectionEndpoint(
	value: string,
): { ok: true; endpoint: ConnectionEndpoint } | { ok: false; code: ConnectionEndpointError } {
	if (value.length === 0) return { ok: false, code: "empty" };
	if (value.length > CONNECTION_ENDPOINT_MAX_LENGTH) return { ok: false, code: "too-long" };
	if (/\s/.test(value)) return { ok: false, code: "whitespace" };
	if ([...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
		return { ok: false, code: "control" };
	}

	const schemeSplit = value.indexOf("://");
	if (schemeSplit <= 0) return { ok: false, code: "missing-scheme" };
	const scheme = value.slice(0, schemeSplit);
	if (!isValidScheme(scheme)) return { ok: false, code: "invalid-scheme" };

	const remainder = value.slice(schemeSplit + 3);
	if (value.includes("@") || remainder.includes("/") || value.includes("?") || value.includes("#")) {
		return { ok: false, code: "credential-smuggle" };
	}
	if (!isValidAuthority(remainder)) return { ok: false, code: "not-origin" };
	return { ok: true, endpoint: value as ConnectionEndpoint };
}

export function connectionEndpointOrigin(endpoint: ConnectionEndpoint): string {
	const schemeSplit = endpoint.indexOf("://");
	if (schemeSplit < 0) return endpoint;
	const remainder = endpoint.slice(schemeSplit + 3);
	const authority = remainder.split("/")[0] ?? remainder;
	return `${endpoint.slice(0, schemeSplit)}://${authority}`;
}

export function stripEndpointToOrigin(value: string): { origin: string; pathPrefix: string | undefined } {
	const trimmed = value.trim();
	try {
		const url = new URL(trimmed);
		const origin = `${url.protocol}//${url.host}`;
		const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
		return { origin, pathPrefix: path.length > 0 ? path : undefined };
	} catch {
		return { origin: trimmed, pathPrefix: undefined };
	}
}

function isValidScheme(scheme: string): boolean {
	if (scheme.length === 0) return false;
	return [...scheme].every((character, index) => {
		if (index === 0) return /[A-Za-z]/.test(character);
		return /[A-Za-z0-9+.-]/.test(character);
	});
}

function isValidAuthority(authority: string): boolean {
	if (authority.length === 0) return false;
	if (authority.startsWith("[")) {
		const close = authority.indexOf("]");
		if (close < 2) return false;
		const host = authority.slice(1, close);
		if (![...host].every((character) => /[0-9A-Fa-f:.]/.test(character))) return false;
		const suffix = authority.slice(close + 1);
		if (suffix.length === 0) return true;
		if (!suffix.startsWith(":")) return false;
		return isValidPort(suffix.slice(1));
	}
	const colon = authority.indexOf(":");
	if (colon < 0) return isValidHost(authority);
	if (authority.indexOf(":", colon + 1) >= 0) return false;
	return isValidHost(authority.slice(0, colon)) && isValidPort(authority.slice(colon + 1));
}

function isValidHost(host: string): boolean {
	if (host.length === 0) return false;
	return [...host].every((character) => /[A-Za-z0-9.-]/.test(character));
}

function isValidPort(port: string): boolean {
	return port.length > 0 && [...port].every((character) => /[0-9]/.test(character));
}
