export interface PluginCheckpointCommit {
	readonly commit: string;
	readonly parent: string | null;
	readonly paths: readonly string[];
	readonly added: number;
	readonly removed: number;
}

export interface PluginCheckpoint {
	readonly id: string;
	readonly operationId: string;
	readonly projectKey: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly intent: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly phase: "verifying" | "reverting" | "settled" | "failed";
	readonly decision?: "kept" | "reverted";
	readonly landed?: PluginCheckpointCommit;
	readonly revertedBy?: PluginCheckpointCommit;
	readonly error?: string;
}

export interface PluginCheckpointsApi {
	list(projectKey?: string): Promise<readonly PluginCheckpoint[]>;
	get(projectKey: string, checkpointId: string): Promise<PluginCheckpoint | undefined>;
	requestRevert(projectKey: string, checkpointId: string): Promise<PluginCheckpoint>;
}
