/**
 * Canonical model identity is `<connectionId>:<upstreamModelId>`.
 * Historical identity is `<provider>/<model>`. Both must keep working for
 * existing sessions, `defaultModel`, and plugin `ctx.ai` `modelKey`.
 */

export const CONNECTION_MODEL_SEPARATOR = ":";
export const LEGACY_MODEL_SEPARATOR = "/";

export interface ConnectionModelRef {
	readonly connectionId: string;
	readonly upstreamModelId: string;
}

export type ModelRefParseError = "empty" | "missing-id" | "ambiguous-separator";

export class InvalidModelRefError extends Error {
	readonly code: ModelRefParseError;

	constructor(code: ModelRefParseError, value: string) {
		super(`invalid model reference (${code}): ${value}`);
		this.name = "InvalidModelRefError";
		this.code = code;
	}
}

export function formatConnectionModelRef(ref: ConnectionModelRef): string {
	return `${ref.connectionId}${CONNECTION_MODEL_SEPARATOR}${ref.upstreamModelId}`;
}

export function formatLegacyModelKey(ref: ConnectionModelRef): string {
	return `${ref.connectionId}${LEGACY_MODEL_SEPARATOR}${ref.upstreamModelId}`;
}

/**
 * Accepts canonical `connectionId:upstream`, legacy `provider/model`, and the
 * already-canonical form. A bare id (no separator) is treated as an upstream
 * model id with an unknown connection — callers must resolve it against the
 * catalog and refuse when more than one Connection advertises it.
 */
export function parseModelRef(value: string): ConnectionModelRef | { upstreamModelId: string } {
	const trimmed = value.trim();
	if (trimmed.length === 0) throw new InvalidModelRefError("empty", value);

	const colon = trimmed.indexOf(CONNECTION_MODEL_SEPARATOR);
	const slash = trimmed.indexOf(LEGACY_MODEL_SEPARATOR);

	if (colon >= 0 && (slash < 0 || colon < slash)) {
		return splitRef(trimmed, colon, value);
	}
	if (slash >= 0) {
		return splitRef(trimmed, slash, value);
	}
	return { upstreamModelId: trimmed };
}

export function parseBoundModelRef(value: string): ConnectionModelRef {
	const parsed = parseModelRef(value);
	if (!("connectionId" in parsed)) throw new InvalidModelRefError("missing-id", value);
	return parsed;
}

export function isConnectionModelRef(value: unknown): value is ConnectionModelRef {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as ConnectionModelRef).connectionId === "string" &&
		typeof (value as ConnectionModelRef).upstreamModelId === "string"
	);
}

export function toCanonicalModelKey(value: string): string {
	const parsed = parseModelRef(value);
	if (!("connectionId" in parsed)) return parsed.upstreamModelId;
	return formatConnectionModelRef(parsed);
}

export function toLegacyModelKey(value: string): string {
	const parsed = parseModelRef(value);
	if (!("connectionId" in parsed)) return parsed.upstreamModelId;
	return formatLegacyModelKey(parsed);
}

/**
 * Map a stored session / settings / plugin model key onto the current catalog.
 * Prefers an exact canonical match, then the legacy `provider/model` form.
 * Does not guess across Connections when only an upstream id is stored.
 */
export function resolveStoredModelKey(
	stored: string,
	available: readonly string[],
): { ok: true; key: string } | { ok: false; reason: "missing" | "ambiguous" } {
	const wanted = stored.trim();
	if (wanted.length === 0) return { ok: false, reason: "missing" };

	const exact = available.find((key) => key === wanted);
	if (exact) return { ok: true, key: exact };

	const canonical = toCanonicalModelKey(wanted);
	const canonicalHit = available.filter((key) => toCanonicalModelKey(key) === canonical);
	if (canonicalHit.length === 1) {
		const key = canonicalHit[0];
		if (key) return { ok: true, key };
	}
	if (canonicalHit.length > 1) return { ok: false, reason: "ambiguous" };

	const parsed = parseModelRef(wanted);
	const upstream = "connectionId" in parsed ? parsed.upstreamModelId : parsed.upstreamModelId;
	const upstreamHits = available.filter((key) => {
		const candidate = parseModelRef(key);
		const candidateUpstream = "connectionId" in candidate ? candidate.upstreamModelId : candidate.upstreamModelId;
		return candidateUpstream === upstream;
	});
	if (upstreamHits.length === 1) {
		const key = upstreamHits[0];
		if (key) return { ok: true, key };
	}
	if (upstreamHits.length > 1) return { ok: false, reason: "ambiguous" };
	return { ok: false, reason: "missing" };
}

function splitRef(value: string, index: number, original: string): ConnectionModelRef {
	const connectionId = value.slice(0, index).trim();
	const upstreamModelId = value.slice(index + 1).trim();
	if (!connectionId || !upstreamModelId) throw new InvalidModelRefError("missing-id", original);
	return { connectionId, upstreamModelId };
}
