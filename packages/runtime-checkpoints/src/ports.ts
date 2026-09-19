import type {
	CheckpointPolicy,
	CheckpointVerificationStep,
	ExecutionReceipt,
	MainlineCheckpoint,
	MainlineCommit,
	ProposeCheckpointInput,
	VerificationOutcome,
} from "./types.js";

export interface CheckpointStore {
	list(projectKey: string): Promise<readonly MainlineCheckpoint[]>;
	get(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint | undefined>;
	getByOperationId(projectKey: string, operationId: string): Promise<MainlineCheckpoint | undefined>;
	append(checkpoint: MainlineCheckpoint): Promise<void>;
	replace(checkpoint: MainlineCheckpoint): Promise<void>;
	listIncomplete(projectKey: string): Promise<readonly MainlineCheckpoint[]>;
	listReceipts(projectKey: string): Promise<readonly ExecutionReceipt[]>;
	getReceipt(projectKey: string, executionId: string): Promise<ExecutionReceipt | undefined>;
	appendReceipt(projectKey: string, receipt: ExecutionReceipt): Promise<void>;
	readPolicy(projectKey: string): Promise<CheckpointPolicy>;
	writePolicy(policy: CheckpointPolicy): Promise<void>;
}

export interface WorkTreeLandInput {
	readonly cwd: string;
	readonly projectKey: string;
	readonly operationId: string;
	readonly intent: string;
	readonly mode: "shadow" | "project-mainline";
}

export interface WorkTreeRestoreInput {
	readonly cwd: string;
	readonly projectKey: string;
	readonly operationId: string;
	readonly commit: string;
	readonly mode: "shadow" | "project-mainline";
}

export interface WorkTreeDiffInput {
	readonly cwd: string;
	readonly projectKey: string;
	readonly fromCommit: string;
	readonly toCommit?: string;
	readonly mode: "shadow" | "project-mainline";
}

export interface WorkTreeDiff {
	readonly fromCommit: string;
	readonly toCommit: string | null;
	readonly paths: readonly string[];
	readonly added: number;
	readonly removed: number;
	readonly patch: string;
}

export interface WorkTreeVcs {
	land(input: WorkTreeLandInput): Promise<MainlineCommit>;
	restore(input: WorkTreeRestoreInput): Promise<MainlineCommit>;
	diff(input: WorkTreeDiffInput): Promise<WorkTreeDiff>;
}

export interface VerificationRunInput {
	readonly executionId: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly command: string;
	readonly cwd: string;
	readonly signal?: AbortSignal;
}

export interface VerificationRunner {
	run(input: VerificationRunInput): Promise<ExecutionReceipt>;
	inspect(executionId: string): Promise<ExecutionReceipt | "running" | undefined>;
}

export interface CheckpointClock {
	now(): number;
}

export interface CheckpointIdFactory {
	checkpointId(): string;
	operationId(): string;
	executionId(projectKey: string, operationId: string, commandIndex: number): string;
}

export type CheckpointEffect =
	| {
			readonly kind: "land";
			readonly key: string;
			readonly checkpoint: MainlineCheckpoint;
	  }
	| {
			readonly kind: "verify";
			readonly key: string;
			readonly checkpoint: MainlineCheckpoint;
			readonly commandIndex: number;
			readonly step: CheckpointVerificationStep;
			readonly executionId: string;
			readonly recordStart: boolean;
	  }
	| {
			readonly kind: "revert";
			readonly key: string;
			readonly checkpoint: MainlineCheckpoint;
	  };

export interface CheckpointEngine {
	propose(input: ProposeCheckpointInput): Promise<{ checkpoint: MainlineCheckpoint; created: boolean }>;
	requestRevert(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint>;
	rerunVerification(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint>;
	recover(projectKey: string): Promise<readonly MainlineCheckpoint[]>;
	advance(projectKey: string): Promise<void>;
	list(projectKey: string): Promise<readonly MainlineCheckpoint[]>;
	get(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint | undefined>;
	readPolicy(projectKey: string): Promise<CheckpointPolicy>;
	setPolicy(policy: CheckpointPolicy): Promise<void>;
}

export type CheckpointIntentRecord =
	| {
			readonly kind: "verification-start";
			readonly checkpoint: MainlineCheckpoint;
			readonly commandIndex: number;
			readonly executionId: string;
	  }
	| {
			readonly kind: "verification-finish";
			readonly checkpoint: MainlineCheckpoint;
			readonly commandIndex: number;
			readonly executionId: string;
			readonly outcome: VerificationOutcome;
	  }
	| {
			readonly kind: "land";
			readonly checkpoint: MainlineCheckpoint;
			readonly commit: MainlineCommit;
	  }
	| {
			readonly kind: "fail";
			readonly checkpoint: MainlineCheckpoint;
			readonly error: string;
	  }
	| {
			readonly kind: "revert";
			readonly checkpoint: MainlineCheckpoint;
			readonly commit: MainlineCommit;
	  }
	| {
			readonly kind: "revert-fail";
			readonly checkpoint: MainlineCheckpoint;
			readonly error: string;
	  };
