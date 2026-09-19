import { parseModelRef, toCanonicalModelKey } from "./model-ref.js";

export const DIAL_SLOTS = ["fast", "deep"] as const;
export type DialSlot = (typeof DIAL_SLOTS)[number];

export const DIAL_PURPOSES = ["summary", "image_description", "prompt_suggestion", "video_review"] as const;
export type DialPurpose = (typeof DIAL_PURPOSES)[number];

export type DialRouteKind = DialSlot | DialPurpose;

export interface DialRouteSlot {
	readonly modelKey: string;
	readonly reasoning?: string;
}

/**
 * Personal / project model routing. Keys are never stored here — only
 * Connection-qualified model identities and optional reasoning levels.
 */
export interface DialRouteTable {
	readonly fast?: DialRouteSlot;
	readonly deep?: DialRouteSlot;
	readonly purposes?: Partial<Record<DialPurpose, DialRouteSlot>>;
}

export const DIAL_ROUTE_FORMAT_EPOCH = 1;

export interface StoredDialRouteTable {
	readonly formatEpoch: typeof DIAL_ROUTE_FORMAT_EPOCH;
	readonly data: DialRouteTable;
}

export type DialRouteError = "missing" | "not-in-catalog" | "ambiguous" | "unsupported-reasoning";

export class AmbiguousDialRouteError extends Error {
	readonly code: DialRouteError = "ambiguous";
	readonly modelKey: string;

	constructor(modelKey: string) {
		super(`${modelKey} is ambiguous across Connections`);
		this.name = "AmbiguousDialRouteError";
		this.modelKey = modelKey;
	}
}

export interface CatalogModel {
	readonly key: string;
	readonly reasoningLevels?: readonly string[];
}

export interface DialRouteResolution {
	readonly kind: DialRouteKind;
	readonly modelKey: string;
	readonly reasoning?: string;
}

export function emptyDialRouteTable(): DialRouteTable {
	return {};
}

export function isDialSlot(value: string): value is DialSlot {
	return (DIAL_SLOTS as readonly string[]).includes(value);
}

export function isDialPurpose(value: string): value is DialPurpose {
	return (DIAL_PURPOSES as readonly string[]).includes(value);
}

/**
 * Resolve a slot against the current catalog. Same upstream model advertised
 * by more than one Connection is a hard refusal, never a silent pick.
 */
export function resolveDialRoute(
	table: DialRouteTable,
	kind: DialRouteKind,
	catalog: readonly CatalogModel[],
): { ok: true; route: DialRouteResolution } | { ok: false; error: DialRouteError; detail: string } {
	const stored = slotOf(table, kind);
	if (!stored) return { ok: false, error: "missing", detail: `${kind} has no route` };

	const match = uniqueCatalogMatch(stored.modelKey, catalog);
	if (!match.ok) return match;

	if (stored.reasoning) {
		const levels = match.model.reasoningLevels ?? [];
		const hit = levels.find((level) => level.toLowerCase() === stored.reasoning?.toLowerCase());
		if (!hit) {
			return {
				ok: false,
				error: "unsupported-reasoning",
				detail: `${match.model.key} does not offer ${stored.reasoning} reasoning`,
			};
		}
		return { ok: true, route: { kind, modelKey: match.model.key, reasoning: hit } };
	}
	return { ok: true, route: { kind, modelKey: match.model.key } };
}

export function uniqueCatalogMatch(
	modelKey: string,
	catalog: readonly CatalogModel[],
): { ok: true; model: CatalogModel } | { ok: false; error: DialRouteError; detail: string } {
	const wanted = toCanonicalModelKey(modelKey);
	const exact = catalog.filter((model) => toCanonicalModelKey(model.key) === wanted);
	if (exact.length === 1) {
		const model = exact[0];
		if (model) return { ok: true, model };
	}
	if (exact.length > 1) {
		return { ok: false, error: "ambiguous", detail: `${modelKey} is ambiguous across Connections` };
	}

	const parsed = parseModelRef(modelKey);
	const upstream = "connectionId" in parsed ? parsed.upstreamModelId : parsed.upstreamModelId;
	const byUpstream = catalog.filter((model) => {
		const candidate = parseModelRef(model.key);
		const candidateUpstream = "connectionId" in candidate ? candidate.upstreamModelId : candidate.upstreamModelId;
		return candidateUpstream === upstream;
	});
	if (byUpstream.length === 1) {
		const model = byUpstream[0];
		if (model) return { ok: true, model };
	}
	if (byUpstream.length > 1) {
		return { ok: false, error: "ambiguous", detail: `${upstream} is ambiguous across Connections` };
	}
	return { ok: false, error: "not-in-catalog", detail: `${modelKey} is not in the current catalog` };
}

export function assertUnambiguousCatalog(catalog: readonly CatalogModel[]): void {
	const seen = new Map<string, string>();
	for (const model of catalog) {
		const parsed = parseModelRef(model.key);
		if (!("connectionId" in parsed)) continue;
		const previous = seen.get(parsed.upstreamModelId);
		if (previous && previous !== parsed.connectionId) {
			throw new AmbiguousDialRouteError(parsed.upstreamModelId);
		}
		seen.set(parsed.upstreamModelId, parsed.connectionId);
	}
}

function slotOf(table: DialRouteTable, kind: DialRouteKind): DialRouteSlot | undefined {
	if (kind === "fast") return table.fast;
	if (kind === "deep") return table.deep;
	return table.purposes?.[kind];
}
