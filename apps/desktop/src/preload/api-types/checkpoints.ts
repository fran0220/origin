import type { CheckpointPolicy, MainlineCheckpoint } from "@origin/runtime-checkpoints";

export type DesktopCheckpoint = MainlineCheckpoint;
export type DesktopCheckpointPolicy = CheckpointPolicy;

export interface DesktopCheckpointsApi {
	list(projectKey?: string): Promise<readonly DesktopCheckpoint[]>;
	get(projectKey: string, checkpointId: string): Promise<DesktopCheckpoint | undefined>;
	revert(projectKey: string, checkpointId: string): Promise<DesktopCheckpoint>;
	rerunVerification(projectKey: string, checkpointId: string): Promise<DesktopCheckpoint>;
	setPolicy(policy: DesktopCheckpointPolicy): Promise<DesktopCheckpointPolicy>;
	getPolicy(projectKey: string): Promise<DesktopCheckpointPolicy>;
}
