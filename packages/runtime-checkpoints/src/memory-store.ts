import type { CheckpointStore } from "./ports.js";
import {
	type CheckpointPolicy,
	DEFAULT_CHECKPOINT_POLICY,
	type ExecutionReceipt,
	type MainlineCheckpoint,
} from "./types.js";

/** In-memory store for unit tests and hosts that inject their own persistence later. */
export class MemoryCheckpointStore implements CheckpointStore {
	private readonly checkpoints = new Map<string, MainlineCheckpoint[]>();
	private readonly receipts = new Map<string, ExecutionReceipt[]>();
	private readonly policies = new Map<string, CheckpointPolicy>();

	async list(projectKey: string): Promise<readonly MainlineCheckpoint[]> {
		return [...(this.checkpoints.get(projectKey) ?? [])];
	}

	async get(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint | undefined> {
		return (this.checkpoints.get(projectKey) ?? []).find((checkpoint) => checkpoint.id === checkpointId);
	}

	async getByOperationId(projectKey: string, operationId: string): Promise<MainlineCheckpoint | undefined> {
		return (this.checkpoints.get(projectKey) ?? []).find((checkpoint) => checkpoint.operationId === operationId);
	}

	async append(checkpoint: MainlineCheckpoint): Promise<void> {
		const existing = this.checkpoints.get(checkpoint.projectKey) ?? [];
		if (
			existing.some(
				(candidate) => candidate.id === checkpoint.id || candidate.operationId === checkpoint.operationId,
			)
		) {
			return;
		}
		this.checkpoints.set(checkpoint.projectKey, [...existing, checkpoint]);
	}

	async replace(checkpoint: MainlineCheckpoint): Promise<void> {
		const existing = this.checkpoints.get(checkpoint.projectKey) ?? [];
		const index = existing.findIndex((candidate) => candidate.id === checkpoint.id);
		if (index < 0) {
			this.checkpoints.set(checkpoint.projectKey, [...existing, checkpoint]);
			return;
		}
		const next = existing.slice();
		next[index] = checkpoint;
		this.checkpoints.set(checkpoint.projectKey, next);
	}

	async listIncomplete(projectKey: string): Promise<readonly MainlineCheckpoint[]> {
		return (this.checkpoints.get(projectKey) ?? []).filter(
			(checkpoint) => checkpoint.phase === "verifying" || checkpoint.phase === "reverting",
		);
	}

	async listReceipts(projectKey: string): Promise<readonly ExecutionReceipt[]> {
		return [...(this.receipts.get(projectKey) ?? [])];
	}

	async getReceipt(projectKey: string, executionId: string): Promise<ExecutionReceipt | undefined> {
		return (this.receipts.get(projectKey) ?? []).find((receipt) => receipt.executionId === executionId);
	}

	async appendReceipt(projectKey: string, receipt: ExecutionReceipt): Promise<void> {
		const existing = this.receipts.get(projectKey) ?? [];
		if (existing.some((candidate) => candidate.executionId === receipt.executionId)) return;
		this.receipts.set(projectKey, [...existing, receipt]);
	}

	async readPolicy(projectKey: string): Promise<CheckpointPolicy> {
		return this.policies.get(projectKey) ?? { ...DEFAULT_CHECKPOINT_POLICY, projectKey };
	}

	async writePolicy(policy: CheckpointPolicy): Promise<void> {
		this.policies.set(policy.projectKey, policy);
	}
}
