import { describe, expect, it } from "vitest";
import { parseRecordingInputLine, parseRecordingJsonlText, parseRecordingTelemetryLine } from "../src/jsonl.js";
import { parseRecordingRecord } from "../src/schema.js";

describe("RecordingRecord schema", () => {
	it("accepts a complete ready record with the Evaluation-facing field names", () => {
		const record = parseRecordingRecord({
			recordType: "recording.record",
			schemaVersion: 1,
			id: "rec_abc",
			projectKey: "proj_1",
			sessionId: "sess_1",
			startedAt: 100,
			endedAt: 5_100,
			durationMs: 5_000,
			video: {
				path: "video.mp4",
				mimeType: "video/mp4",
				codec: "h264",
				width: 1280,
				height: 720,
				fps: 30,
				sizeBytes: 12_345,
			},
			audio: "opus-muxed",
			frames: [{ atMs: 0, path: "frames/000.png" }],
			telemetryPath: "telemetry.jsonl",
			inputPath: "input.jsonl",
			retention: "2h",
			expiresAt: 100 + 2 * 60 * 60 * 1000,
			status: "ready",
		});
		expect(record.id).toBe("rec_abc");
		expect(record.video?.codec).toBe("h264");
		expect(record.audio).toBe("opus-muxed");
	});

	it("rejects unknown status and extra properties", () => {
		expect(() =>
			parseRecordingRecord({
				recordType: "recording.record",
				schemaVersion: 1,
				id: "x",
				projectKey: "home",
				sessionId: "s",
				startedAt: 0,
				audio: "none",
				frames: [],
				telemetryPath: "t",
				inputPath: "i",
				retention: "30m",
				status: "done",
			}),
		).toThrow(/Invalid RecordingRecord/);
	});
});

describe("recording JSONL lines", () => {
	it("parses telemetry and input lines that share the capture-start origin", () => {
		const telemetry = parseRecordingJsonlText(
			'{"atMs":16,"kind":"tick","payload":{"frame":1}}\n{"atMs":24,"kind":"input","payload":{"ok":true,"result":true}}\n{"atMs":33,"kind":"state"}\n',
			parseRecordingTelemetryLine,
		);
		expect(telemetry).toEqual([
			{ atMs: 16, kind: "tick", payload: { frame: 1 } },
			{ atMs: 24, kind: "input", payload: { ok: true, result: true } },
			{ atMs: 33, kind: "state" },
		]);
		const input = parseRecordingInputLine({ atMs: 48, kind: "keydown", payload: { key: "Space" } });
		expect(input.kind).toBe("keydown");
	});

	it("rejects negative timestamps", () => {
		expect(() => parseRecordingTelemetryLine({ atMs: -1, kind: "tick" })).toThrow();
	});
});
