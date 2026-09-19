export type HostEvaluationScope = { kind: "global" } | { kind: "project"; projectKey: string };

export function toHostEvaluationScope(scope?: { kind?: string; projectKey?: string }): HostEvaluationScope {
	return scope?.kind === "project" && scope.projectKey
		? { kind: "project", projectKey: scope.projectKey }
		: { kind: "global" };
}
