export { aggregateOutcome, type CriterionAssessment, findingsForCriteria } from "./aggregation.js";
export { CompositeEvaluationEvidenceProvider } from "./composite-evidence.js";
export {
	EVALUATION_RECORD_TYPES,
	EVALUATION_SCHEMA_VERSION,
	type EvaluationRecordType,
	MAX_EVIDENCE_PER_ATTEMPT,
} from "./constants.js";
export { createEvaluationClock } from "./default-clock.js";
export { EvaluationError, type EvaluationErrorCode } from "./errors.js";
export { computeInputFingerprint, fingerprintPayload } from "./fingerprint.js";
export { InMemoryEvaluationStore } from "./memory-store.js";
export type {
	EvaluationCapture,
	EvaluationClock,
	EvaluationEvidenceProvider,
	EvaluationStore,
	VerifierRunContext,
	VerifierRunner,
	VerifierRunResult,
} from "./ports.js";
export {
	EvaluationAttemptRecordSchema,
	EvaluationDefinitionRecordSchema,
	EvaluationEvidenceRecordSchema,
	EvaluationFindingSchema,
	EvaluationOutcomeSchema,
	EvaluationScopeSchema,
	EvaluationTriggerSchema,
	EvidenceSourceSchema,
	isCurrentAttemptWrite,
	isCurrentDefinitionWrite,
	isCurrentEvidenceWrite,
	parseEvaluationAttemptRecord,
	parseEvaluationDefinitionRecord,
	parseEvaluationEvidenceRecord,
	toAttemptRecord,
	toDefinitionRecord,
	toEvidenceRecord,
	VerifierRefSchema,
} from "./schema.js";
export { GLOBAL_SCOPE_KEY, HOME_PROJECT_KEY, parseScopeKey, sameScope, scopeKey } from "./scope.js";
export { EvaluationService, type EvaluationServiceOptions } from "./service.js";
export type {
	ArtifactDigestSnapshot,
	ArtifactEvidenceRef,
	AssertionVerifierRef,
	CheckpointEvidenceRef,
	CheckpointSnapshot,
	CommandVerifierRef,
	EvaluationAttempt,
	EvaluationAttemptView,
	EvaluationCriterion,
	EvaluationDefinition,
	EvaluationEvidence,
	EvaluationFinding,
	EvaluationOutcome,
	EvaluationScope,
	EvaluationTrigger,
	EvaluationTriggerKind,
	EvidenceSource,
	EvidenceSourceKind,
	ExecutionReceiptEvidenceRef,
	ExecutionReceiptSnapshot,
	FindingState,
	OutcomeKind,
	RecordingEvidenceRef,
	RecordingSnapshot,
	RunEvaluationInput,
	TraceEvidenceRef,
	TraceSnapshot,
	UpsertCriterionInput,
	UpsertDefinitionInput,
	VerifierRef,
} from "./types.js";
export { validateDefinition, validateEvidence, validateTrigger, validateUpsertInput } from "./validate.js";
