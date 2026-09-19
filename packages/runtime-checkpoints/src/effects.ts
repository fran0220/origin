import type { CheckpointEffect } from "./ports.js";
import { nextUnsettledVerification } from "./state-machine.js";
import type { MainlineCheckpoint } from "./types.js";

/**
 * Durable effects for one checkpoint. Land the worktree first so a Turn always
 * has a restore point, then verify, then settle. Revert is a later user/policy
 * effect that appends a new commit.
 */
export function pendingEffects(
	checkpoint: MainlineCheckpoint,
	executionIdFor: (commandIndex: number) => string,
): CheckpointEffect[] {
	if (checkpoint.phase === "verifying") {
		if (!checkpoint.landed) {
			return [
				{
					kind: "land",
					key: `land:${checkpoint.projectKey}:${checkpoint.operationId}`,
					checkpoint,
				},
			];
		}
		const next = nextUnsettledVerification(checkpoint);
		if (!next) return [];
		if (next.step.state.state === "queued") {
			const executionId = executionIdFor(next.index);
			return [
				{
					kind: "verify",
					key: `verify:${checkpoint.projectKey}:${checkpoint.operationId}:${next.index}`,
					checkpoint,
					commandIndex: next.index,
					step: next.step,
					executionId,
					recordStart: true,
				},
			];
		}
		if (next.step.state.state === "running") {
			return [
				{
					kind: "verify",
					key: `verify:${checkpoint.projectKey}:${checkpoint.operationId}:${next.index}`,
					checkpoint,
					commandIndex: next.index,
					step: next.step,
					executionId: next.step.state.executionId,
					recordStart: false,
				},
			];
		}
		return [];
	}
	if (checkpoint.phase === "reverting" && checkpoint.landed && checkpoint.revertOperationId) {
		return [
			{
				kind: "revert",
				key: `revert:${checkpoint.projectKey}:${checkpoint.revertOperationId}`,
				checkpoint,
			},
		];
	}
	return [];
}
