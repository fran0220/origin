export const EVALUATION_SCHEMA_VERSION = 1;
export const MAX_EVIDENCE_PER_ATTEMPT = 256;

export const EVALUATION_RECORD_TYPES = {
	definition: "evaluation.definition",
	attempt: "evaluation.attempt",
	evidence: "evaluation.evidence",
} as const;

export type EvaluationRecordType = (typeof EVALUATION_RECORD_TYPES)[keyof typeof EVALUATION_RECORD_TYPES];
