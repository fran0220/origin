export type PluginEvaluationScopeKind = "global" | "project";

export interface PluginProjectEvaluationScope {
	readonly kind: PluginEvaluationScopeKind;
	readonly projectKey?: string;
}

/**
 * Host-resolved identity for one project cwd. Plugins must not hash cwd
 * themselves; each capability keeps its historical storage key.
 */
export interface PluginProjectIdentity {
	readonly cwd: string;
	readonly evaluationScope: PluginProjectEvaluationScope;
	readonly checkpointProjectKey: string;
	readonly recordingProjectKey: string;
}

/**
 * Resolve the host's per-capability project keys for a bound workspace cwd.
 * Requires `workspace.read`. Relative or empty paths are rejected by the host.
 */
export interface PluginProjectApi {
	resolve(cwd: string): Promise<PluginProjectIdentity>;
}
