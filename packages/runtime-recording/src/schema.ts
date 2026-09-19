import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const RECORDING_RECORD_TYPE = "recording.record";
export const RECORDING_SCHEMA_VERSION = 1;

export const RecordingStatusSchema = Type.Union([
	Type.Literal("recording"),
	Type.Literal("finalizing"),
	Type.Literal("ready"),
	Type.Literal("failed"),
]);

export const RecordingRetentionSchema = Type.Union([
	Type.Literal("30m"),
	Type.Literal("2h"),
	Type.Literal("until-cleared"),
]);

export const RecordingAudioSchema = Type.Union([Type.Literal("none"), Type.Literal("opus-muxed")]);

export const RecordingVideoCodecSchema = Type.Union([Type.Literal("h264"), Type.Literal("av1")]);

export const RecordingVideoSchema = Type.Object(
	{
		path: Type.String({ minLength: 1 }),
		mimeType: Type.String({ minLength: 1 }),
		codec: RecordingVideoCodecSchema,
		width: Type.Integer({ minimum: 1 }),
		height: Type.Integer({ minimum: 1 }),
		fps: Type.Number({ exclusiveMinimum: 0 }),
		sizeBytes: Type.Integer({ minimum: 0 }),
	},
	{ additionalProperties: false },
);

export const RecordingFrameSchema = Type.Object(
	{
		atMs: Type.Integer({ minimum: 0 }),
		path: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export const RecordingRecordSchema = Type.Object(
	{
		recordType: Type.Literal(RECORDING_RECORD_TYPE),
		schemaVersion: Type.Literal(RECORDING_SCHEMA_VERSION),
		id: Type.String({ minLength: 1 }),
		projectKey: Type.String({ minLength: 1 }),
		sessionId: Type.String({ minLength: 1 }),
		startedAt: Type.Integer({ minimum: 0 }),
		endedAt: Type.Optional(Type.Integer({ minimum: 0 })),
		durationMs: Type.Optional(Type.Integer({ minimum: 0 })),
		video: Type.Optional(RecordingVideoSchema),
		audio: RecordingAudioSchema,
		frames: Type.Array(RecordingFrameSchema),
		telemetryPath: Type.String({ minLength: 1 }),
		inputPath: Type.String({ minLength: 1 }),
		retention: RecordingRetentionSchema,
		expiresAt: Type.Optional(Type.Integer({ minimum: 0 })),
		status: RecordingStatusSchema,
		error: Type.Optional(Type.String()),
		droppedFrames: Type.Optional(Type.Integer({ minimum: 0 })),
	},
	{ additionalProperties: false },
);

export type RecordingStatus = Static<typeof RecordingStatusSchema>;
export type RecordingRetention = Static<typeof RecordingRetentionSchema>;
export type RecordingAudio = Static<typeof RecordingAudioSchema>;
export type RecordingVideoCodec = Static<typeof RecordingVideoCodecSchema>;
export type RecordingVideo = Static<typeof RecordingVideoSchema>;
export type RecordingFrame = Static<typeof RecordingFrameSchema>;
export type RecordingRecord = Static<typeof RecordingRecordSchema>;

export function parseRecordingRecord(value: unknown): RecordingRecord {
	if (!Value.Check(RecordingRecordSchema, value)) {
		const issues = [...Value.Errors(RecordingRecordSchema, value)].slice(0, 5);
		const summary = issues.map((issue) => `${issue.path || "/"}: ${issue.message}`).join("; ");
		throw new Error(`Invalid RecordingRecord: ${summary || "schema mismatch"}`);
	}
	return value;
}

export function isRecordingRecord(value: unknown): value is RecordingRecord {
	return Value.Check(RecordingRecordSchema, value);
}
