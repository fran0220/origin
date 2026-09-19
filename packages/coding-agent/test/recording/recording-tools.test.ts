import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, AssistantMessage, Model, TextContent, Usage } from "@vetta/ai";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { RecordingEngine, RecordingRecord, RecordingSampleResult } from "@vetta/runtime-recording";
import { applyRecordingRetention } from "@vetta/runtime-recording";
import { afterEach, describe, expect, it } from "vitest";
import { createRecordingToolRegistrations, estimateVideoPromptTokens } from "../../src/recording/index.js";

const videoModel: Model<Api> = {
	id: "gemini-2.5-flash",
	name: "Gemini 2.5 Flash",
	api: "google-generative-ai",
	provider: "google",
	baseUrl: "https://generativelanguage.googleapis.com",
	reasoning: false,
	input: ["text", "image", "video"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 8_192,
};

function readyRecord(_directory: string, overrides: Partial<RecordingRecord> = {}): RecordingRecord {
	return applyRecordingRetention({
		recordType: "recording.record",
		schemaVersion: 1,
		id: "rec_flow",
		projectKey: "home",
		sessionId: "desktop",
		startedAt: 1_000,
		endedAt: 6_000,
		durationMs: 5_000,
		audio: "none",
		frames: [],
		telemetryPath: "telemetry.jsonl",
		inputPath: "input.jsonl",
		retention: "2h",
		status: "ready",
		video: {
			path: "video.mp4",
			mimeType: "video/mp4",
			codec: "h264",
			width: 64,
			height: 48,
			fps: 10,
			sizeBytes: 128,
		},
		...overrides,
	});
}

class FakeRecordingEngine implements RecordingEngine {
	record: RecordingRecord;
	samples: RecordingSampleResult | undefined;

	constructor(record: RecordingRecord) {
		this.record = { ...record, status: "recording", video: undefined, endedAt: undefined, durationMs: undefined };
	}

	async start(): Promise<RecordingRecord> {
		return this.record;
	}
	async stop(): Promise<RecordingRecord> {
		this.record = {
			...this.record,
			status: "ready",
			endedAt: 6_000,
			durationMs: 5_000,
			video: readyRecord("").video,
		};
		return this.record;
	}
	async cancel(): Promise<RecordingRecord> {
		this.record = { ...this.record, status: "failed", error: "cancelled" };
		return this.record;
	}
	async list(): Promise<readonly RecordingRecord[]> {
		return [this.record];
	}
	async read(): Promise<RecordingRecord> {
		return this.record;
	}
	async sample(): Promise<RecordingSampleResult> {
		this.samples = {
			recordingId: this.record.id,
			frames: [
				{ atMs: 0, path: "frames/a.png" },
				{ atMs: 1_000, path: "frames/b.png" },
			],
		};
		return this.samples;
	}
	async clear(): Promise<void> {
		this.record = { ...this.record, status: "failed", error: "cleared" };
	}
	async sweepExpired(): Promise<readonly string[]> {
		return [];
	}
}

const emptyUsageCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

function usage(partial: Omit<Usage, "cost">): Usage {
	return { ...partial, cost: emptyUsageCost };
}

function textOf(content: readonly { readonly type: string; readonly text?: string }[]): string {
	const part = content[0];
	return part?.type === "text" ? (part as TextContent).text : "";
}

async function execute<TInput extends object>(tool: RuntimeToolDefinition<TInput>, input: TInput) {
	return tool.execute({
		sessionId: "session",
		turnId: "turn",
		toolCallId: tool.name,
		input,
		signal: new AbortController().signal,
	});
}

describe("recording agent tools", () => {
	const directories: string[] = [];

	afterEach(async () => {
		directories.length = 0;
	});

	it("covers start → stop → sample → review_recording with a fake video-capable provider", async () => {
		const directory = await mkdtemp(join(tmpdir(), "vetta-recording-tools-"));
		directories.push(directory);
		await writeFile(join(directory, "video.mp4"), "fake-mp4");
		const engine = new FakeRecordingEngine(readyRecord(directory));
		const reviews: unknown[] = [];
		const registrations = createRecordingToolRegistrations({
			engine,
			session: () => ({ sessionId: "desktop", projectKey: "home" }),
			resolveVideoModel: async () => ({ model: videoModel, apiKey: "test" }),
			directoryFor: () => directory,
			complete: async (_model, context) => {
				reviews.push(context);
				const message: AssistantMessage = {
					role: "assistant",
					content: [{ type: "text", text: "The clip shows a solid red frame. recording:rec_flow" }],
					api: "google-generative-ai",
					provider: "google",
					model: videoModel.id,
					usage: usage({ input: 2_000, output: 40, cacheRead: 0, cacheWrite: 0, totalTokens: 2_040 }),
					stopReason: "stop",
					timestamp: Date.now(),
				};
				return message;
			},
		});
		const byName = Object.fromEntries(registrations.map((item) => [item.tool.name, item.tool]));

		const started = await execute(byName.recording_start, {
			description: "record the page",
			url: "https://example.com",
		});
		expect(textOf(started.content)).toContain("recording_start ok");

		const stopped = await execute(byName.recording_stop, { description: "stop", recordingId: "rec_flow" });
		expect(textOf(stopped.content)).toContain("ready");

		const sampled = await execute(byName.recording_sample, {
			description: "sample",
			recordingId: "rec_flow",
			atMs: [0, 1_000],
		});
		expect(textOf(sampled.content)).toContain("2 frames");

		const reviewed = await execute(byName.review_recording, {
			description: "review",
			recordingId: "rec_flow",
			question: "What color is the frame?",
		});
		expect(textOf(reviewed.content)).toContain("recording:rec_flow");
		expect(reviews).toHaveLength(1);
	});

	it("refuses review when token usage is far below the conservative video check", async () => {
		const directory = await mkdtemp(join(tmpdir(), "vetta-recording-tools-low-"));
		await writeFile(join(directory, "video.mp4"), "fake-mp4");
		const engine = new FakeRecordingEngine(readyRecord(directory));
		await engine.stop();
		const registrations = createRecordingToolRegistrations({
			engine,
			session: () => ({ sessionId: "desktop", projectKey: "home" }),
			resolveVideoModel: async () => ({ model: videoModel }),
			directoryFor: () => directory,
			complete: async () => ({
				role: "assistant",
				content: [{ type: "text", text: "ok" }],
				api: "google-generative-ai",
				provider: "google",
				model: videoModel.id,
				usage: usage({ input: 8, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 10 }),
				stopReason: "stop",
				timestamp: Date.now(),
			}),
		});
		const review = registrations.find((item) => item.tool.name === "review_recording")?.tool;
		const result = await execute(review!, {
			description: "review",
			recordingId: "rec_flow",
			question: "Describe the clip",
		});
		expect(textOf(result.content)).toContain("token usage");
		expect(estimateVideoPromptTokens(5_000, "Describe the clip")).toBeGreaterThan(2_000);
	});
});
