import { describe, expect, it } from "vitest";
import {
	applyRecordingRetention,
	computeRecordingExpiresAt,
	isRecordingExpired,
	selectExpiredRecordings,
} from "../src/retention.js";
import type { RecordingRecord } from "../src/schema.js";

function record(overrides: Partial<RecordingRecord> = {}): RecordingRecord {
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
		status: "ready",
		...overrides,
	};
}

describe("recording retention", () => {
	it("computes 30m and 2h expiry from startedAt with an injected clock origin", () => {
		expect(computeRecordingExpiresAt(0, "30m")).toBe(30 * 60 * 1000);
		expect(computeRecordingExpiresAt(1_000, "2h")).toBe(1_000 + 2 * 60 * 60 * 1000);
		expect(computeRecordingExpiresAt(1_000, "until-cleared")).toBeUndefined();
	});

	it("treats until-cleared records as never expired", () => {
		const kept = record({ retention: "until-cleared", expiresAt: undefined });
		expect(isRecordingExpired(kept, Number.MAX_SAFE_INTEGER)).toBe(false);
	});

	it("expires 30m records at the injected now, not wall clock", () => {
		const startedAt = 10_000;
		const rec = applyRecordingRetention(record({ startedAt, retention: "30m" }));
		expect(rec.expiresAt).toBe(startedAt + 30 * 60 * 1000);
		expect(isRecordingExpired(rec, rec.expiresAt! - 1)).toBe(false);
		expect(isRecordingExpired(rec, rec.expiresAt!)).toBe(true);
	});

	it("selects only expired records from a mixed list", () => {
		const now = 40 * 60 * 1000;
		const expired = applyRecordingRetention(record({ id: "old", startedAt: 0, retention: "30m" }));
		const fresh = applyRecordingRetention(record({ id: "fresh", startedAt: 20 * 60 * 1000, retention: "30m" }));
		const kept = record({ id: "kept", retention: "until-cleared" });
		expect(selectExpiredRecordings([expired, fresh, kept], now).map((item) => item.id)).toEqual(["old"]);
	});
});
