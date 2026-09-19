import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * Telemetry and injected input share one monotonic clock origin: Host capture-start
 * acknowledgement. `atMs` is milliseconds since that origin, not wall time.
 */
export const RecordingTelemetryKindSchema = Type.Union([
	Type.Literal("tick"),
	Type.Literal("state"),
	Type.Literal("advance"),
	Type.Literal("pick"),
	Type.Literal("read_entity"),
	Type.Literal("patch_entity"),
	Type.Literal("probe_error"),
	Type.Literal("dropped_frame"),
]);

export const RecordingTelemetryLineSchema = Type.Object(
	{
		atMs: Type.Integer({ minimum: 0 }),
		kind: RecordingTelemetryKindSchema,
		payload: Type.Optional(Type.Unknown()),
	},
	{ additionalProperties: false },
);

export const RecordingInputKindSchema = Type.Union([
	Type.Literal("keydown"),
	Type.Literal("keyup"),
	Type.Literal("pointer"),
	Type.Literal("wheel"),
	Type.Literal("text"),
	Type.Literal("probe"),
]);

export const RecordingInputLineSchema = Type.Object(
	{
		atMs: Type.Integer({ minimum: 0 }),
		kind: RecordingInputKindSchema,
		payload: Type.Unknown(),
	},
	{ additionalProperties: false },
);

export type RecordingTelemetryKind = Static<typeof RecordingTelemetryKindSchema>;
export type RecordingTelemetryLine = Static<typeof RecordingTelemetryLineSchema>;
export type RecordingInputKind = Static<typeof RecordingInputKindSchema>;
export type RecordingInputLine = Static<typeof RecordingInputLineSchema>;

export function parseRecordingTelemetryLine(value: unknown): RecordingTelemetryLine {
	if (!Value.Check(RecordingTelemetryLineSchema, value)) {
		throw new Error("Invalid recording telemetry line");
	}
	return value;
}

export function parseRecordingInputLine(value: unknown): RecordingInputLine {
	if (!Value.Check(RecordingInputLineSchema, value)) {
		throw new Error("Invalid recording input line");
	}
	return value;
}

export function serializeRecordingJsonlLine(line: RecordingTelemetryLine | RecordingInputLine): string {
	return JSON.stringify(line);
}

export function parseRecordingJsonlText<T>(text: string, parseLine: (value: unknown) => T): T[] {
	const lines: T[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const trimmed = raw.trim();
		if (trimmed.length === 0) continue;
		lines.push(parseLine(JSON.parse(trimmed) as unknown));
	}
	return lines;
}
