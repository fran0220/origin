import {
	boundCheckpointFailure,
	type CheckpointDecision,
	type CheckpointVerificationStep,
	type MainlineCheckpoint,
	type MainlineCommit,
	type ProposeCheckpointInput,
	type VerificationOutcome,
	verificationOutcomePassed,
} from "./types.js";

export function createProposedCheckpoint(input: {
	readonly id: string;
	readonly operationId: string;
	readonly createdAt: number;
	readonly propose: ProposeCheckpointInput;
}): MainlineCheckpoint {
	const verification: CheckpointVerificationStep[] = input.propose.verificationCommands.map((command) => ({
		command,
		cwd: input.propose.cwd,
		state: { state: "queued" },
	}));
	return {
		recordType: "checkpoint.mainline",
		schemaVersion: 1,
		id: input.id,
		operationId: input.operationId,
		projectKey: input.propose.projectKey,
		sessionId: input.propose.sessionId,
		turnId: input.propose.turnId,
		intent: input.propose.intent,
		createdAt: input.createdAt,
		updatedAt: input.createdAt,
		verification,
		phase: "verifying",
	};
}

export function markVerificationRunning(
	checkpoint: MainlineCheckpoint,
	commandIndex: number,
	executionId: string,
	updatedAt: number,
): MainlineCheckpoint {
	const step = requireStep(checkpoint, commandIndex);
	if (step.state.state === "settled") return checkpoint;
	if (step.state.state === "running" && step.state.executionId === executionId) return checkpoint;
	return replaceStep(checkpoint, commandIndex, { ...step, state: { state: "running", executionId } }, updatedAt);
}

export function markVerificationSettled(
	checkpoint: MainlineCheckpoint,
	commandIndex: number,
	executionId: string,
	outcome: VerificationOutcome,
	updatedAt: number,
): MainlineCheckpoint {
	const step = requireStep(checkpoint, commandIndex);
	if (step.state.state === "settled" && step.state.executionId === executionId) return checkpoint;
	return replaceStep(
		checkpoint,
		commandIndex,
		{ ...step, state: { state: "settled", executionId, outcome } },
		updatedAt,
	);
}

export function markLanded(
	checkpoint: MainlineCheckpoint,
	commit: MainlineCommit,
	updatedAt: number,
): MainlineCheckpoint {
	if (checkpoint.phase === "settled" && checkpoint.decision === "kept" && checkpoint.landed) {
		return checkpoint;
	}
	return {
		...checkpoint,
		phase: "settled",
		decision: "kept",
		landed: commit,
		updatedAt,
		error: undefined,
	};
}

export function markFailed(checkpoint: MainlineCheckpoint, error: string, updatedAt: number): MainlineCheckpoint {
	if (checkpoint.phase === "failed" && checkpoint.error === boundCheckpointFailure(error)) return checkpoint;
	return {
		...checkpoint,
		phase: "failed",
		updatedAt,
		error: boundCheckpointFailure(error),
	};
}

export function markReverting(
	checkpoint: MainlineCheckpoint,
	revertOperationId: string,
	updatedAt: number,
): MainlineCheckpoint {
	if (checkpoint.phase === "reverting" && checkpoint.revertOperationId === revertOperationId) return checkpoint;
	if (checkpoint.phase === "settled" && checkpoint.decision === "reverted") return checkpoint;
	return {
		...checkpoint,
		phase: "reverting",
		revertOperationId,
		updatedAt,
		error: undefined,
	};
}

export function markReverted(
	checkpoint: MainlineCheckpoint,
	commit: MainlineCommit,
	updatedAt: number,
): MainlineCheckpoint {
	if (checkpoint.phase === "settled" && checkpoint.decision === "reverted" && checkpoint.revertedBy) {
		return checkpoint;
	}
	return {
		...checkpoint,
		phase: "settled",
		decision: "reverted",
		revertedBy: commit,
		updatedAt,
		error: undefined,
	};
}

export function resetVerificationForRerun(checkpoint: MainlineCheckpoint, updatedAt: number): MainlineCheckpoint {
	return {
		...checkpoint,
		phase: "verifying",
		decision: undefined,
		error: undefined,
		updatedAt,
		verification: checkpoint.verification.map((step) => ({
			command: step.command,
			cwd: step.cwd,
			state: { state: "queued" },
		})),
	};
}

export function interruptRunningVerification(checkpoint: MainlineCheckpoint, updatedAt: number): MainlineCheckpoint {
	let changed = false;
	const verification = checkpoint.verification.map((step) => {
		if (step.state.state !== "running") return step;
		changed = true;
		return {
			...step,
			state: {
				state: "settled" as const,
				executionId: step.state.executionId,
				outcome: { kind: "interrupted" as const },
			},
		};
	});
	if (!changed) return checkpoint;
	return { ...checkpoint, verification, updatedAt };
}

export function nextUnsettledVerification(
	checkpoint: MainlineCheckpoint,
): { readonly index: number; readonly step: CheckpointVerificationStep } | undefined {
	for (const [index, step] of checkpoint.verification.entries()) {
		if (step.state.state === "settled" && verificationOutcomePassed(step.state.outcome)) continue;
		return { index, step };
	}
	return undefined;
}

export function allVerificationsPassed(checkpoint: MainlineCheckpoint): boolean {
	return checkpoint.verification.every(
		(step) => step.state.state === "settled" && verificationOutcomePassed(step.state.outcome),
	);
}

export function canRequestRevert(checkpoint: MainlineCheckpoint): boolean {
	return checkpoint.phase === "settled" && checkpoint.decision === "kept" && checkpoint.landed !== undefined;
}

export function canRerunVerification(checkpoint: MainlineCheckpoint): boolean {
	return (
		checkpoint.verification.length > 0 &&
		(checkpoint.phase === "settled" || checkpoint.phase === "failed") &&
		checkpoint.decision !== "reverted"
	);
}

export function decideAfterFailedVerification(
	checkpoint: MainlineCheckpoint,
	policy: "keep-for-user" | "auto-revert",
	updatedAt: number,
): { readonly checkpoint: MainlineCheckpoint; readonly decision: CheckpointDecision | "reverting" } {
	if (policy === "auto-revert" && checkpoint.landed) {
		return {
			checkpoint: markReverting(checkpoint, `${checkpoint.operationId}:auto-revert`, updatedAt),
			decision: "reverting",
		};
	}
	return {
		checkpoint: {
			...checkpoint,
			phase: "settled",
			decision: "kept",
			updatedAt,
		},
		decision: "kept",
	};
}

function requireStep(checkpoint: MainlineCheckpoint, commandIndex: number): CheckpointVerificationStep {
	const step = checkpoint.verification[commandIndex];
	if (!step) {
		throw new Error(`Checkpoint ${checkpoint.id} has no verification command at index ${commandIndex}`);
	}
	return step;
}

function replaceStep(
	checkpoint: MainlineCheckpoint,
	commandIndex: number,
	step: CheckpointVerificationStep,
	updatedAt: number,
): MainlineCheckpoint {
	const verification = checkpoint.verification.map((candidate, index) => (index === commandIndex ? step : candidate));
	return { ...checkpoint, verification, updatedAt };
}
