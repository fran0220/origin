import { HOME_SUBJECT_ID, MAX_SUBJECT_ID_BYTES, PROMOTION_SOURCE_PREFIX } from "./constants.js";
import { invalidEvolution } from "./errors.js";
import type { EvolutionScope } from "./types.js";
import { validateText } from "./validate.js";

export function globalScope(): EvolutionScope {
	return { kind: "global" };
}

export function subjectScope(subjectId: string): EvolutionScope {
	const id = subjectId.trim();
	validateText(id, MAX_SUBJECT_ID_BYTES, "subject id", true);
	if (id.includes("\0") || id === "." || id === "..") {
		throw invalidEvolution("subject id is not a valid harness scope");
	}
	return { kind: "subject", subjectId: id };
}

export function homeScope(): EvolutionScope {
	return subjectScope(HOME_SUBJECT_ID);
}

export function isGlobalScope(scope: EvolutionScope): boolean {
	return scope.kind === "global";
}

export function scopesEqual(left: EvolutionScope, right: EvolutionScope): boolean {
	if (left.kind === "global" || right.kind === "global") {
		return left.kind === "global" && right.kind === "global";
	}
	return left.subjectId === right.subjectId;
}

export function formatScope(scope: EvolutionScope): string {
	return scope.kind === "global" ? "global" : `subject:${scope.subjectId}`;
}

export function parseScope(value: string): EvolutionScope {
	if (value === "global") return globalScope();
	if (value.startsWith("subject:")) return subjectScope(value.slice("subject:".length));
	throw invalidEvolution(`unknown harness scope '${value}'`);
}

export function scopeStorageKey(scope: EvolutionScope): string {
	return formatScope(scope);
}

export function promotionSource(scope: EvolutionScope): string {
	if (scope.kind === "global") {
		throw invalidEvolution("the shared baseline cannot be promoted into itself");
	}
	return `${PROMOTION_SOURCE_PREFIX}${scope.subjectId}`;
}

export function promotedFrom(source: string): string | undefined {
	return source.startsWith(PROMOTION_SOURCE_PREFIX) ? source.slice(PROMOTION_SOURCE_PREFIX.length) : undefined;
}
