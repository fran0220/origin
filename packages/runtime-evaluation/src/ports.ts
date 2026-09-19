import type { CriterionAssessment } from "./aggregation.js";
import type {
	EvaluationAttempt,
	EvaluationDefinition,
	EvaluationEvidence,
	EvaluationScope,
	EvaluationTrigger,
	VerifierRef,
} from "./types.js";

export interface EvaluationStore {
	listDefinitions(scope: EvaluationScope): Promise<readonly EvaluationDefinition[]>;
	getDefinition(scope: EvaluationScope, definitionId: string): Promise<EvaluationDefinition | undefined>;
	upsertDefinition(scope: EvaluationScope, definition: EvaluationDefinition): Promise<EvaluationDefinition>;
	listAttempts(scope: EvaluationScope): Promise<readonly EvaluationAttempt[]>;
	getAttempt(scope: EvaluationScope, attemptId: string): Promise<EvaluationAttempt | undefined>;
	findAttemptByFingerprint(scope: EvaluationScope, fingerprint: string): Promise<EvaluationAttempt | undefined>;
	appendAttempt(attempt: EvaluationAttempt): Promise<void>;
	putEvidence(scope: EvaluationScope, evidence: EvaluationEvidence): Promise<void>;
	getEvidence(scope: EvaluationScope, evidenceId: string): Promise<EvaluationEvidence | undefined>;
	listEvidence(scope: EvaluationScope, evidenceIds: readonly string[]): Promise<readonly EvaluationEvidence[]>;
}

export interface EvaluationCapture {
	readonly evidence: readonly EvaluationEvidence[];
}

export interface EvaluationEvidenceProvider {
	readonly kind: string;
	capture(scopeKey: string, trigger: EvaluationTrigger): Promise<EvaluationCapture>;
}

export interface VerifierRunContext {
	readonly scope: EvaluationScope;
	readonly trigger: EvaluationTrigger;
	readonly evidence: readonly EvaluationEvidence[];
	readonly signal?: AbortSignal;
}

export interface VerifierRunResult {
	readonly assessment: CriterionAssessment;
	readonly evidence: readonly EvaluationEvidence[];
}

export interface VerifierRunner {
	run(verifier: VerifierRef, criterionId: string, context: VerifierRunContext): Promise<VerifierRunResult>;
}

export interface EvaluationClock {
	now(): Date;
	createId(prefix: string): string;
}
