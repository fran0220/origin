/** Discriminated verification / command-execution outcome. Only `Exited{0}` passes. */
export type VerificationOutcome =
	| { readonly kind: "exited"; readonly code: number }
	| { readonly kind: "signalled"; readonly signal: number }
	| { readonly kind: "cancelled" }
	| { readonly kind: "timed-out" }
	| { readonly kind: "interrupted" }
	| { readonly kind: "failed-to-start" }
	| { readonly kind: "unknown" };

export type CheckpointPhase = "verifying" | "reverting" | "settled" | "failed";
export type CheckpointDecision = "kept" | "reverted";

export type CheckpointVerificationState =
	| { readonly state: "queued" }
	| { readonly state: "running"; readonly executionId: string }
	| { readonly state: "settled"; readonly executionId: string; readonly outcome: VerificationOutcome };

export interface CheckpointVerificationStep {
	readonly command: string;
	readonly cwd: string;
	readonly state: CheckpointVerificationState;
}

export interface MainlineCommit {
	readonly commit: string;
	readonly parent: string | null;
	readonly paths: readonly string[];
	readonly added: number;
	readonly removed: number;
}

export const CHECKPOINT_RECORD_TYPE = "checkpoint.mainline";
export const CHECKPOINT_SCHEMA_VERSION = 1;
export const EXECUTION_RECEIPT_RECORD_TYPE = "checkpoint.execution-receipt";
export const EXECUTION_RECEIPT_SCHEMA_VERSION = 1;

export const HOME_PROJECT_KEY = "home";

export const MAX_CHECKPOINT_INTENT_BYTES = 16 * 1024;
export const MAX_CHECKPOINT_FAILURE_BYTES = 16 * 1024;
export const MAX_CHECKPOINT_PATHS = 10_000;
export const MAX_CHECKPOINT_PATH_BYTES = 16 * 1024;
export const MAX_PROJECT_CHECKPOINTS = 1_000;

export interface MainlineCheckpoint {
	readonly recordType: typeof CHECKPOINT_RECORD_TYPE;
	readonly schemaVersion: typeof CHECKPOINT_SCHEMA_VERSION;
	readonly id: string;
	readonly operationId: string;
	readonly projectKey: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly intent: string;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly verification: readonly CheckpointVerificationStep[];
	readonly phase: CheckpointPhase;
	readonly decision?: CheckpointDecision;
	readonly landed?: MainlineCommit;
	readonly revertOperationId?: string;
	readonly revertedBy?: MainlineCommit;
	readonly error?: string;
}

export interface ExecutionReceipt {
	readonly recordType: typeof EXECUTION_RECEIPT_RECORD_TYPE;
	readonly schemaVersion: typeof EXECUTION_RECEIPT_SCHEMA_VERSION;
	readonly executionId: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly toolCallId?: string;
	readonly command: string;
	readonly cwd: string;
	readonly startedAt: number;
	readonly endedAt: number;
	readonly outcome: VerificationOutcome;
}

export type CheckpointVcsMode = "shadow" | "project-mainline";

export type CheckpointFailurePolicy = "keep-for-user" | "auto-revert";

export interface CheckpointPolicy {
	readonly projectKey: string;
	readonly vcsMode: CheckpointVcsMode;
	readonly verificationCommands: readonly string[];
	readonly onVerificationFailure: CheckpointFailurePolicy;
}

export const DEFAULT_CHECKPOINT_POLICY: Omit<CheckpointPolicy, "projectKey"> = {
	vcsMode: "shadow",
	verificationCommands: [],
	onVerificationFailure: "keep-for-user",
};

export interface ProposeCheckpointInput {
	readonly projectKey: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly intent: string;
	readonly verificationCommands: readonly string[];
	readonly cwd: string;
}

export interface CheckpointProposeResult {
	readonly checkpoint: MainlineCheckpoint;
	readonly created: boolean;
}

export function verificationOutcomePassed(outcome: VerificationOutcome): boolean {
	return outcome.kind === "exited" && outcome.code === 0;
}

export function boundCheckpointFailure(failure: string): string {
	if (failure.length <= MAX_CHECKPOINT_FAILURE_BYTES) return failure;
	let boundary = MAX_CHECKPOINT_FAILURE_BYTES;
	while (boundary > 0 && failure.charCodeAt(boundary - 1) >= 0xdc00 && failure.charCodeAt(boundary - 1) <= 0xdfff) {
		boundary -= 1;
	}
	return failure.slice(0, boundary);
}
