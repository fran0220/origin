import { EvaluationError } from "./errors.js";
import type { EvaluationScope } from "./types.js";

export const GLOBAL_SCOPE_KEY = "global";
export const HOME_PROJECT_KEY = "home";

export function scopeKey(scope: EvaluationScope): string {
	return scope.kind === "global" ? GLOBAL_SCOPE_KEY : `project:${scope.projectKey}`;
}

export function parseScopeKey(key: string): EvaluationScope {
	if (key === GLOBAL_SCOPE_KEY) return { kind: "global" };
	if (key.startsWith("project:")) {
		const projectKey = key.slice("project:".length);
		if (projectKey.length === 0) {
			throw new EvaluationError("unavailable", "Evaluation project scope is empty");
		}
		return { kind: "project", projectKey };
	}
	throw new EvaluationError("unavailable", `Unknown Evaluation scope key: ${key}`);
}

export function sameScope(left: EvaluationScope, right: EvaluationScope): boolean {
	return scopeKey(left) === scopeKey(right);
}
