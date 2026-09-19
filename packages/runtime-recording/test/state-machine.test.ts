import { describe, expect, it } from "vitest";
import type { RecordingRecord } from "../src/schema.js";
import {
	canTransitionRecording,
	isActiveRecordingStatus,
	isTerminalRecordingStatus,
	RecordingStateError,
	transitionRecording,
} from "../src/state-machine.js";

function record(status: RecordingRecord["status"]): RecordingRecord {
	return {
		recordType: "recording.record",
		schemaVersion: 1,
		id: "rec_1",
		projectKey: "home",
		sessionId: "sess_1",
		startedAt: 1_000,
		audio: "none",
		frames: [],
		telemetryPath: "telemetry.jsonl",
		inputPath: "input.jsonl",
		retention: "30m",
		status,
	};
}

describe("recording state machine", () => {
	it("allows recording → finalizing → ready", () => {
		const started = record("recording");
		const finalizing = transitionRecording(started, "finalizing");
		expect(finalizing.status).toBe("finalizing");
		const ready = transitionRecording(finalizing, "ready", {
			endedAt: 6_000,
			durationMs: 5_000,
		});
		expect(ready.status).toBe("ready");
		expect(ready.durationMs).toBe(5_000);
	});

	it("allows recording → failed and finalizing → failed", () => {
		expect(canTransitionRecording("recording", "failed")).toBe(true);
		expect(canTransitionRecording("finalizing", "failed")).toBe(true);
		const failed = transitionRecording(record("recording"), "failed", { error: "encoder crashed" });
		expect(failed.status).toBe("failed");
		expect(failed.error).toBe("encoder crashed");
	});

	it("rejects ready → recording and failed → ready", () => {
		expect(() => transitionRecording(record("ready"), "recording")).toThrow(RecordingStateError);
		expect(() => transitionRecording(record("failed"), "ready")).toThrow(RecordingStateError);
		expect(canTransitionRecording("ready", "failed")).toBe(false);
	});

	it("classifies active and terminal statuses", () => {
		expect(isActiveRecordingStatus("recording")).toBe(true);
		expect(isActiveRecordingStatus("finalizing")).toBe(true);
		expect(isTerminalRecordingStatus("ready")).toBe(true);
		expect(isTerminalRecordingStatus("failed")).toBe(true);
		expect(isActiveRecordingStatus("ready")).toBe(false);
	});
});
