export type EvaluationScope = { readonly kind: "global" } | { readonly kind: "project"; readonly projectKey: string };

export type EvaluationTriggerKind = "turn" | "checkpoint" | "milestone" | "manual";

export interface EvaluationTrigger {
	readonly kind: EvaluationTriggerKind;
	readonly ref?: string;
}

export interface CommandVerifierRef {
	readonly kind: "command";
	readonly command: string;
	readonly args?: readonly string[];
	readonly cwd?: string;
	readonly timeoutMs?: number;
}

export interface AssertionVerifierRef {
	readonly kind: "assertion";
	readonly source: "recording-telemetry";
	readonly expression: string;
}

export type VerifierRef = CommandVerifierRef | AssertionVerifierRef;

export interface EvaluationCriterion {
	readonly id: string;
	readonly title: string;
	readonly required: boolean;
	readonly verifier?: VerifierRef;
}

export interface EvaluationDefinition {
	readonly id: string;
	readonly revision: number;
	readonly title: string;
	readonly criteria: readonly EvaluationCriterion[];
	readonly updatedAt: string;
}

export type EvidenceSourceKind = "execution-receipt" | "checkpoint" | "recording" | "trace" | "artifact";

export interface ExecutionReceiptEvidenceRef {
	readonly kind: "execution-receipt";
	readonly executionId: string;
	readonly projectKey?: string;
}

export interface CheckpointEvidenceRef {
	readonly kind: "checkpoint";
	readonly checkpointId: string;
	readonly projectKey: string;
}

/**
 * Recording 证据引用。`runtime-recording` 落地后按同一形状对接；
 * 在此之前宿主可以注册 provider，但默认适配器返回空集。
 */
export interface RecordingEvidenceRef {
	readonly kind: "recording";
	readonly recordingId: string;
	readonly projectKey: string;
	readonly sampleAtMs?: number;
	readonly telemetryPath?: string;
}

export interface TraceEvidenceRef {
	readonly kind: "trace";
	readonly traceId: string;
	readonly spanId?: string;
	readonly sessionId?: string;
}

export interface ArtifactEvidenceRef {
	readonly kind: "artifact";
	readonly artifactId: string;
	readonly digest: string;
	readonly path?: string;
}

export type EvidenceSource =
	| ExecutionReceiptEvidenceRef
	| CheckpointEvidenceRef
	| RecordingEvidenceRef
	| TraceEvidenceRef
	| ArtifactEvidenceRef;

export interface EvaluationEvidence {
	readonly id: string;
	readonly source: EvidenceSource;
	readonly capturedAt: string;
	readonly digest: string;
	readonly summary: string;
}

export type FindingState = "passed" | "failed" | "inconclusive" | "error";

export interface EvaluationFinding {
	readonly criterionId: string;
	readonly state: FindingState;
	readonly evidenceIds: readonly string[];
	readonly note?: string;
}

export type OutcomeKind = "passed" | "failed" | "inconclusive" | "error" | "cancelled" | "budget-limited";

export interface EvaluationOutcome {
	readonly kind: OutcomeKind;
	readonly settledAt: string;
}

export interface EvaluationAttempt {
	readonly id: string;
	readonly scope: EvaluationScope;
	readonly definitionId: string;
	readonly definitionRevision: number;
	readonly trigger: EvaluationTrigger;
	readonly inputFingerprint: string;
	readonly evidenceIds: readonly string[];
	readonly findings: readonly EvaluationFinding[];
	readonly outcome: EvaluationOutcome;
	readonly createdAt: string;
}

export interface EvaluationAttemptView {
	readonly attempt: EvaluationAttempt;
	readonly definition: EvaluationDefinition;
	readonly evidence: readonly EvaluationEvidence[];
}

export interface UpsertDefinitionInput {
	readonly id?: string;
	readonly title: string;
	readonly criteria: readonly UpsertCriterionInput[];
}

export interface UpsertCriterionInput {
	readonly id?: string;
	readonly title: string;
	readonly required: boolean;
	readonly verifier?: VerifierRef;
}

export interface RunEvaluationInput {
	readonly scope: EvaluationScope;
	readonly definitionId: string;
	readonly trigger: EvaluationTrigger;
	readonly signal?: AbortSignal;
}

/** Checkpoint 线程落地后的收据形状；未推送时以此为合同。 */
export interface ExecutionReceiptSnapshot {
	readonly executionId: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly toolCallId?: string;
	readonly command: string;
	readonly cwd: string;
	readonly startedAt: string;
	readonly endedAt: string;
	readonly outcome: unknown;
}

/** Checkpoint 主线记录的只读投影。 */
export interface CheckpointSnapshot {
	readonly id: string;
	readonly projectKey: string;
	readonly sessionId: string;
	readonly turnId: string;
	readonly phase: string;
	readonly decision?: string;
	readonly landed?: { readonly commit: string };
}

/** runtime-telemetry Trace 的只读投影。 */
export interface TraceSnapshot {
	readonly id: string;
	readonly traceId: string;
	readonly name: string;
	readonly state: string;
	readonly startedAt: number;
	readonly sessionId?: string;
}

export interface ArtifactDigestSnapshot {
	readonly artifactId: string;
	readonly digest: string;
	readonly path?: string;
	readonly summary: string;
}

/** Recording 线程落地后的记录形状。 */
export interface RecordingSnapshot {
	readonly id: string;
	readonly projectKey: string;
	readonly telemetryPath?: string;
	readonly videoPath?: string;
	readonly status: string;
}
