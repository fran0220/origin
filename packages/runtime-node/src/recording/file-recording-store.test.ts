import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyRecordingRetention, type RecordingRecord } from "@origin/runtime-recording";
import { afterEach, describe, expect, it } from "vitest";
import { FileRecordingStore } from "./file-recording-store.js";

function record(overrides: Partial<RecordingRecord> = {}): RecordingRecord {
	return applyRecordingRetention({
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
	});
}

describe("FileRecordingStore retention sweep", () => {
	const directories: string[] = [];

	afterEach(async () => {
		await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
	});

	it("removes expired records and orphan directories using an injected clock", async () => {
		const root = await mkdtemp(join(tmpdir(), "vetta-recording-store-"));
		directories.push(root);
		let now = 1_000;
		const store = new FileRecordingStore({ rootDirectory: root, now: () => now });
		const expired = record({ id: "old", startedAt: 1_000, retention: "30m" });
		const kept = record({ id: "kept", startedAt: 1_000, retention: "until-cleared" });
		await store.put(expired);
		await store.put(kept);
		const orphanDirectory = join(root, "home", "orphan");
		await mkdir(orphanDirectory, { recursive: true });
		await writeFile(join(orphanDirectory, "leftover.txt"), "x");

		now = 1_000 + 31 * 60 * 1000;
		const removed = await store.sweepExpired(now);
		expect(removed).toContain("old");
		expect(await store.get("old")).toBeUndefined();
		expect((await store.get("kept"))?.id).toBe("kept");
		await expect(rm(orphanDirectory, { recursive: false })).rejects.toThrow();
	});
});
