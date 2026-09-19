import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { EVALUATION_RECORD_TYPES, EVALUATION_SCHEMA_VERSION } from "./constants.js";
import type {
	EvaluationAttempt,
	EvaluationDefinition,
	EvaluationEvidence,
	EvaluationFinding,
	EvaluationOutcome,
	EvaluationScope,
	EvaluationTrigger,
	EvidenceSource,
	VerifierRef,
} from "./types.js";

const CommandVerifierSchema = Type.Object(
	{
		kind: Type.Literal("command"),
		command: Type.String({ minLength: 1 }),
		args: Type.Optional(Type.Array(Type.String())),
		cwd: Type.Optional(Type.String()),
		timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
	},
	{ additionalProperties: false },
);

const AssertionVerifierSchema = Type.Object(
	{
		kind: Type.Literal("assertion"),
		source: Type.Literal("recording-telemetry"),
		expression: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export const VerifierRefSchema = Type.Union([CommandVerifierSchema, AssertionVerifierSchema]);

export const EvaluationCriterionSchema = Type.Object(
	{
		id: Type.String({ minLength: 1 }),
		title: Type.String({ minLength: 1 }),
		required: Type.Boolean(),
		verifier: Type.Optional(VerifierRefSchema),
	},
	{ additionalProperties: false },
);

export const EvaluationDefinitionRecordSchema = Type.Object(
	{
		recordType: Type.Literal(EVALUATION_RECORD_TYPES.definition),
		schemaVersion: Type.Literal(EVALUATION_SCHEMA_VERSION),
		id: Type.String({ minLength: 1 }),
		revision: Type.Integer({ minimum: 1 }),
		title: Type.String({ minLength: 1 }),
		criteria: Type.Array(EvaluationCriterionSchema, { minItems: 1 }),
		updatedAt: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

const GlobalScopeSchema = Type.Object({ kind: Type.Literal("global") }, { additionalProperties: false });
const ProjectScopeSchema = Type.Object(
	{ kind: Type.Literal("project"), projectKey: Type.String({ minLength: 1 }) },
	{ additionalProperties: false },
);
export const EvaluationScopeSchema = Type.Union([GlobalScopeSchema, ProjectScopeSchema]);

export const EvaluationTriggerSchema = Type.Object(
	{
		kind: Type.Union([
			Type.Literal("turn"),
			Type.Literal("checkpoint"),
			Type.Literal("milestone"),
			Type.Literal("manual"),
		]),
		ref: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const ExecutionReceiptSourceSchema = Type.Object(
	{
		kind: Type.Literal("execution-receipt"),
		executionId: Type.String({ minLength: 1 }),
		projectKey: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const CheckpointSourceSchema = Type.Object(
	{
		kind: Type.Literal("checkpoint"),
		checkpointId: Type.String({ minLength: 1 }),
		projectKey: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

const RecordingSourceSchema = Type.Object(
	{
		kind: Type.Literal("recording"),
		recordingId: Type.String({ minLength: 1 }),
		projectKey: Type.String({ minLength: 1 }),
		sampleAtMs: Type.Optional(Type.Integer({ minimum: 0 })),
		telemetryPath: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const TraceSourceSchema = Type.Object(
	{
		kind: Type.Literal("trace"),
		traceId: Type.String({ minLength: 1 }),
		spanId: Type.Optional(Type.String()),
		sessionId: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

const ArtifactSourceSchema = Type.Object(
	{
		kind: Type.Literal("artifact"),
		artifactId: Type.String({ minLength: 1 }),
		digest: Type.String({ minLength: 1 }),
		path: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export const EvidenceSourceSchema = Type.Union([
	ExecutionReceiptSourceSchema,
	CheckpointSourceSchema,
	RecordingSourceSchema,
	TraceSourceSchema,
	ArtifactSourceSchema,
]);

export const EvaluationEvidenceRecordSchema = Type.Object(
	{
		recordType: Type.Literal(EVALUATION_RECORD_TYPES.evidence),
		schemaVersion: Type.Literal(EVALUATION_SCHEMA_VERSION),
		id: Type.String({ minLength: 1 }),
		source: EvidenceSourceSchema,
		capturedAt: Type.String({ minLength: 1 }),
		digest: Type.String({ minLength: 1 }),
		summary: Type.String(),
	},
	{ additionalProperties: false },
);

export const EvaluationFindingSchema = Type.Object(
	{
		criterionId: Type.String({ minLength: 1 }),
		state: Type.Union([
			Type.Literal("passed"),
			Type.Literal("failed"),
			Type.Literal("inconclusive"),
			Type.Literal("error"),
		]),
		evidenceIds: Type.Array(Type.String()),
		note: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export const EvaluationOutcomeSchema = Type.Object(
	{
		kind: Type.Union([
			Type.Literal("passed"),
			Type.Literal("failed"),
			Type.Literal("inconclusive"),
			Type.Literal("error"),
			Type.Literal("cancelled"),
			Type.Literal("budget-limited"),
		]),
		settledAt: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export const EvaluationAttemptRecordSchema = Type.Object(
	{
		recordType: Type.Literal(EVALUATION_RECORD_TYPES.attempt),
		schemaVersion: Type.Literal(EVALUATION_SCHEMA_VERSION),
		id: Type.String({ minLength: 1 }),
		scope: EvaluationScopeSchema,
		definitionId: Type.String({ minLength: 1 }),
		definitionRevision: Type.Integer({ minimum: 1 }),
		trigger: EvaluationTriggerSchema,
		inputFingerprint: Type.String({ minLength: 1 }),
		evidenceIds: Type.Array(Type.String(), { maxItems: 256 }),
		findings: Type.Array(EvaluationFindingSchema),
		outcome: EvaluationOutcomeSchema,
		createdAt: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export type EvaluationDefinitionRecord = Static<typeof EvaluationDefinitionRecordSchema>;
export type EvaluationAttemptRecord = Static<typeof EvaluationAttemptRecordSchema>;
export type EvaluationEvidenceRecord = Static<typeof EvaluationEvidenceRecordSchema>;

const CompatibleDefinitionReadSchema = Type.Object(
	{
		recordType: Type.Literal(EVALUATION_RECORD_TYPES.definition),
		schemaVersion: Type.Integer({ minimum: 1 }),
		id: Type.String({ minLength: 1 }),
		revision: Type.Integer({ minimum: 1 }),
		title: Type.String({ minLength: 1 }),
		criteria: Type.Array(EvaluationCriterionSchema, { minItems: 1 }),
		updatedAt: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: true },
);

const CompatibleAttemptReadSchema = Type.Object(
	{
		recordType: Type.Literal(EVALUATION_RECORD_TYPES.attempt),
		schemaVersion: Type.Integer({ minimum: 1 }),
		id: Type.String({ minLength: 1 }),
		scope: EvaluationScopeSchema,
		definitionId: Type.String({ minLength: 1 }),
		definitionRevision: Type.Integer({ minimum: 1 }),
		trigger: EvaluationTriggerSchema,
		inputFingerprint: Type.String({ minLength: 1 }),
		evidenceIds: Type.Array(Type.String()),
		findings: Type.Array(EvaluationFindingSchema),
		outcome: EvaluationOutcomeSchema,
		createdAt: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: true },
);

const CompatibleEvidenceReadSchema = Type.Object(
	{
		recordType: Type.Literal(EVALUATION_RECORD_TYPES.evidence),
		schemaVersion: Type.Integer({ minimum: 1 }),
		id: Type.String({ minLength: 1 }),
		source: EvidenceSourceSchema,
		capturedAt: Type.String({ minLength: 1 }),
		digest: Type.String({ minLength: 1 }),
		summary: Type.String(),
	},
	{ additionalProperties: true },
);

function parseCompatible<T>(schema: TSchema, value: unknown): T | undefined {
	if (!Value.Check(schema, value)) return undefined;
	return value as T;
}

export function parseEvaluationDefinitionRecord(value: unknown): EvaluationDefinition | undefined {
	const record = parseCompatible<EvaluationDefinitionRecord>(CompatibleDefinitionReadSchema, value);
	if (!record) return undefined;
	return {
		id: record.id,
		revision: record.revision,
		title: record.title,
		criteria: record.criteria.map((criterion) => ({
			id: criterion.id,
			title: criterion.title,
			required: criterion.required,
			...(criterion.verifier ? { verifier: criterion.verifier as VerifierRef } : {}),
		})),
		updatedAt: record.updatedAt,
	};
}

export function parseEvaluationAttemptRecord(value: unknown): EvaluationAttempt | undefined {
	const record = parseCompatible<EvaluationAttemptRecord>(CompatibleAttemptReadSchema, value);
	if (!record) return undefined;
	return {
		id: record.id,
		scope: record.scope as EvaluationScope,
		definitionId: record.definitionId,
		definitionRevision: record.definitionRevision,
		trigger: record.trigger as EvaluationTrigger,
		inputFingerprint: record.inputFingerprint,
		evidenceIds: record.evidenceIds,
		findings: record.findings as EvaluationFinding[],
		outcome: record.outcome as EvaluationOutcome,
		createdAt: record.createdAt,
	};
}

export function parseEvaluationEvidenceRecord(value: unknown): EvaluationEvidence | undefined {
	const record = parseCompatible<EvaluationEvidenceRecord>(CompatibleEvidenceReadSchema, value);
	if (!record) return undefined;
	return {
		id: record.id,
		source: record.source as EvidenceSource,
		capturedAt: record.capturedAt,
		digest: record.digest,
		summary: record.summary,
	};
}

function toWritableVerifier(verifier: VerifierRef): EvaluationDefinitionRecord["criteria"][number]["verifier"] {
	if (verifier.kind === "assertion") {
		return { kind: "assertion", source: verifier.source, expression: verifier.expression };
	}
	return {
		kind: "command",
		command: verifier.command,
		...(verifier.args ? { args: [...verifier.args] } : {}),
		...(verifier.cwd ? { cwd: verifier.cwd } : {}),
		...(typeof verifier.timeoutMs === "number" ? { timeoutMs: verifier.timeoutMs } : {}),
	};
}

export function toDefinitionRecord(definition: EvaluationDefinition): EvaluationDefinitionRecord {
	return {
		recordType: EVALUATION_RECORD_TYPES.definition,
		schemaVersion: EVALUATION_SCHEMA_VERSION,
		id: definition.id,
		revision: definition.revision,
		title: definition.title,
		criteria: definition.criteria.map((criterion) => ({
			id: criterion.id,
			title: criterion.title,
			required: criterion.required,
			...(criterion.verifier ? { verifier: toWritableVerifier(criterion.verifier) } : {}),
		})),
		updatedAt: definition.updatedAt,
	};
}

export function toAttemptRecord(attempt: EvaluationAttempt): EvaluationAttemptRecord {
	return {
		recordType: EVALUATION_RECORD_TYPES.attempt,
		schemaVersion: EVALUATION_SCHEMA_VERSION,
		id: attempt.id,
		scope: attempt.scope,
		definitionId: attempt.definitionId,
		definitionRevision: attempt.definitionRevision,
		trigger: attempt.trigger,
		inputFingerprint: attempt.inputFingerprint,
		evidenceIds: [...attempt.evidenceIds],
		findings: attempt.findings.map((finding) => ({
			criterionId: finding.criterionId,
			state: finding.state,
			evidenceIds: [...finding.evidenceIds],
			...(finding.note ? { note: finding.note } : {}),
		})),
		outcome: attempt.outcome,
		createdAt: attempt.createdAt,
	};
}

export function toEvidenceRecord(evidence: EvaluationEvidence): EvaluationEvidenceRecord {
	return {
		recordType: EVALUATION_RECORD_TYPES.evidence,
		schemaVersion: EVALUATION_SCHEMA_VERSION,
		id: evidence.id,
		source: evidence.source,
		capturedAt: evidence.capturedAt,
		digest: evidence.digest,
		summary: evidence.summary,
	};
}

export function isCurrentDefinitionWrite(value: unknown): boolean {
	return Value.Check(EvaluationDefinitionRecordSchema, value);
}

export function isCurrentAttemptWrite(value: unknown): boolean {
	return Value.Check(EvaluationAttemptRecordSchema, value);
}

export function isCurrentEvidenceWrite(value: unknown): boolean {
	return Value.Check(EvaluationEvidenceRecordSchema, value);
}
