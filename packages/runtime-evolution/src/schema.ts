import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { EVOLUTION_RECORD_TYPE, EVOLUTION_SCHEMA_VERSION } from "./constants.js";
import { invalidEvolution } from "./errors.js";
import type { RefinementEvent } from "./types.js";

const ScopeSchema = Type.Union([
	Type.Object({ kind: Type.Literal("global") }, { additionalProperties: false }),
	Type.Object(
		{ kind: Type.Literal("subject"), subjectId: Type.String({ minLength: 1, maxLength: 512 }) },
		{ additionalProperties: false },
	),
]);

const SkillSchema = Type.Object(
	{
		invocation: Type.String({ minLength: 1 }),
		arguments: Type.Optional(Type.Record(Type.String(), Type.String())),
	},
	{ additionalProperties: false },
);

const EntrySchema = Type.Object(
	{
		id: Type.String(),
		kind: Type.Union([
			Type.Literal("prompt"),
			Type.Literal("memory"),
			Type.Literal("skill"),
			Type.Literal("subagent"),
		]),
		title: Type.String(),
		content: Type.String(),
		skill: Type.Optional(SkillSchema),
		source: Type.String(),
		version: Type.Integer({ minimum: 1 }),
		createdAtMs: Type.Integer({ minimum: 0 }),
		updatedAtMs: Type.Integer({ minimum: 0 }),
	},
	{ additionalProperties: false },
);

const CreateEditSchema = Type.Object(
	{
		action: Type.Literal("create"),
		entry: Type.Object(
			{
				id: Type.Optional(Type.String()),
				kind: EntrySchema.properties.kind,
				title: Type.String(),
				content: Type.String(),
				skill: Type.Optional(SkillSchema),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);

const UpdateEditSchema = Type.Object(
	{
		action: Type.Literal("update"),
		id: Type.String(),
		expectedVersion: Type.Integer({ minimum: 1 }),
		patch: Type.Object(
			{
				title: Type.Optional(Type.String()),
				content: Type.Optional(Type.String()),
				skill: Type.Optional(SkillSchema),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);

const DeleteEditSchema = Type.Object(
	{
		action: Type.Literal("delete"),
		id: Type.String(),
		expectedVersion: Type.Integer({ minimum: 1 }),
	},
	{ additionalProperties: false },
);

export const HarnessEditSchema = Type.Union([CreateEditSchema, UpdateEditSchema, DeleteEditSchema]);

export const RefinementProposalSchema = Type.Object(
	{
		summary: Type.String({ minLength: 1 }),
		rationale: Type.String({ minLength: 1 }),
		expectedOutcome: Type.String({ minLength: 1 }),
		edits: Type.Array(HarnessEditSchema, { minItems: 1, maxItems: 32 }),
	},
	{ additionalProperties: false },
);

const AppliedEditSchema = Type.Object(
	{
		edit: HarnessEditSchema,
		entryId: Type.String(),
		before: Type.Union([EntrySchema, Type.Null()]),
		after: Type.Union([EntrySchema, Type.Null()]),
	},
	{ additionalProperties: false },
);

const RejectedEditSchema = Type.Object(
	{
		edit: HarnessEditSchema,
		reason: Type.String(),
	},
	{ additionalProperties: false },
);

const OriginSchema = Type.Object(
	{
		sessionId: Type.String({ minLength: 1 }),
		turnId: Type.String({ minLength: 1 }),
		toolCallId: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export const RefinementEventSchema = Type.Object(
	{
		recordType: Type.Literal(EVOLUTION_RECORD_TYPE),
		schemaVersion: Type.Literal(EVOLUTION_SCHEMA_VERSION),
		digest: Type.String(),
		parentDigest: Type.Union([Type.String(), Type.Null()]),
		scope: ScopeSchema,
		revision: Type.Integer({ minimum: 1 }),
		kind: Type.Union([Type.Literal("applied"), Type.Literal("rollback")]),
		rolledBackDigest: Type.Optional(Type.String()),
		proposal: RefinementProposalSchema,
		applied: Type.Array(AppliedEditSchema),
		rejected: Type.Array(RejectedEditSchema),
		origin: OriginSchema,
		createdAtMs: Type.Integer({ minimum: 0 }),
	},
	{ additionalProperties: false },
);

export type RefinementEventRecord = Static<typeof RefinementEventSchema>;

export function parseRefinementEventRecord(value: unknown): RefinementEvent {
	if (!Value.Check(RefinementEventSchema, value)) {
		throw invalidEvolution("stored refinement event does not match schema version 1");
	}
	return value as RefinementEvent;
}

export const EvolutionScopeSchema = ScopeSchema;
