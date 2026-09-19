import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
	CHECKPOINT_RECORD_TYPE,
	CHECKPOINT_SCHEMA_VERSION,
	EXECUTION_RECEIPT_RECORD_TYPE,
	EXECUTION_RECEIPT_SCHEMA_VERSION,
	type ExecutionReceipt,
	type MainlineCheckpoint,
	type VerificationOutcome,
} from "./types.js";

const VerificationOutcomeSchema = Type.Union([
	Type.Object({ kind: Type.Literal("exited"), code: Type.Integer() }, { additionalProperties: false }),
	Type.Object({ kind: Type.Literal("signalled"), signal: Type.Integer() }, { additionalProperties: false }),
	Type.Object({ kind: Type.Literal("cancelled") }, { additionalProperties: false }),
	Type.Object({ kind: Type.Literal("timed-out") }, { additionalProperties: false }),
	Type.Object({ kind: Type.Literal("interrupted") }, { additionalProperties: false }),
	Type.Object({ kind: Type.Literal("failed-to-start") }, { additionalProperties: false }),
	Type.Object({ kind: Type.Literal("unknown") }, { additionalProperties: false }),
]);

const CheckpointVerificationStateSchema = Type.Union([
	Type.Object({ state: Type.Literal("queued") }, { additionalProperties: false }),
	Type.Object(
		{ state: Type.Literal("running"), executionId: Type.String({ minLength: 1 }) },
		{ additionalProperties: false },
	),
	Type.Object(
		{
			state: Type.Literal("settled"),
			executionId: Type.String({ minLength: 1 }),
			outcome: VerificationOutcomeSchema,
		},
		{ additionalProperties: false },
	),
]);

const CheckpointVerificationStepSchema = Type.Object(
	{
		command: Type.String({ minLength: 1 }),
		cwd: Type.String({ minLength: 1 }),
		state: CheckpointVerificationStateSchema,
	},
	{ additionalProperties: false },
);

const MainlineCommitSchema = Type.Object(
	{
		commit: Type.String({ minLength: 1 }),
		parent: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
		paths: Type.Array(Type.String()),
		added: Type.Integer({ minimum: 0 }),
		removed: Type.Integer({ minimum: 0 }),
	},
	{ additionalProperties: false },
);

export const MainlineCheckpointSchema = Type.Object(
	{
		recordType: Type.Literal(CHECKPOINT_RECORD_TYPE),
		schemaVersion: Type.Literal(CHECKPOINT_SCHEMA_VERSION),
		id: Type.String({ minLength: 1 }),
		operationId: Type.String({ minLength: 1 }),
		projectKey: Type.String({ minLength: 1 }),
		sessionId: Type.String({ minLength: 1 }),
		turnId: Type.String({ minLength: 1 }),
		intent: Type.String(),
		createdAt: Type.Number(),
		updatedAt: Type.Number(),
		verification: Type.Array(CheckpointVerificationStepSchema),
		phase: Type.Union([
			Type.Literal("verifying"),
			Type.Literal("reverting"),
			Type.Literal("settled"),
			Type.Literal("failed"),
		]),
		decision: Type.Optional(Type.Union([Type.Literal("kept"), Type.Literal("reverted")])),
		landed: Type.Optional(MainlineCommitSchema),
		revertOperationId: Type.Optional(Type.String({ minLength: 1 })),
		revertedBy: Type.Optional(MainlineCommitSchema),
		error: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export const ExecutionReceiptSchema = Type.Object(
	{
		recordType: Type.Literal(EXECUTION_RECEIPT_RECORD_TYPE),
		schemaVersion: Type.Literal(EXECUTION_RECEIPT_SCHEMA_VERSION),
		executionId: Type.String({ minLength: 1 }),
		sessionId: Type.String({ minLength: 1 }),
		turnId: Type.String({ minLength: 1 }),
		toolCallId: Type.Optional(Type.String({ minLength: 1 })),
		command: Type.String(),
		cwd: Type.String({ minLength: 1 }),
		startedAt: Type.Number(),
		endedAt: Type.Number(),
		outcome: VerificationOutcomeSchema,
	},
	{ additionalProperties: false },
);

export type MainlineCheckpointRecord = Static<typeof MainlineCheckpointSchema>;
export type ExecutionReceiptRecord = Static<typeof ExecutionReceiptSchema>;
export type VerificationOutcomeRecord = Static<typeof VerificationOutcomeSchema>;

export function isMainlineCheckpoint(value: unknown): value is MainlineCheckpoint {
	return Value.Check(MainlineCheckpointSchema, value);
}

export function isExecutionReceipt(value: unknown): value is ExecutionReceipt {
	return Value.Check(ExecutionReceiptSchema, value);
}

export function isVerificationOutcome(value: unknown): value is VerificationOutcome {
	return Value.Check(VerificationOutcomeSchema, value);
}

export function parseMainlineCheckpoint(value: unknown): MainlineCheckpoint | undefined {
	return isMainlineCheckpoint(value) ? value : undefined;
}

export function parseExecutionReceipt(value: unknown): ExecutionReceipt | undefined {
	return isExecutionReceipt(value) ? value : undefined;
}
