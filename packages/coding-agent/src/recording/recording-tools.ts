import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import type { Api, Model, UserContentPart, VideoContent } from "@vetta/ai";
import { completeSimple } from "@vetta/ai";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { transcodeRecordingForReview } from "@vetta/runtime-node/recording";
import type { RecordingEngine, RecordingRecord, RecordingRetention } from "@vetta/runtime-recording";
import { ToolCallDescriptionSchema } from "@vetta/runtime-tools/coding";

export const REVIEW_RECORDING_BUDGET_BYTES = 128 * 1024 * 1024;
const TEXT_TOKEN_ALLOWANCE = 2_048;

export const RecordingStartInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	url: Type.String({ minLength: 1, description: "http(s) page or project file: URL to record." }),
	projectKey: Type.Optional(Type.String()),
	width: Type.Optional(Type.Integer({ minimum: 1 })),
	height: Type.Optional(Type.Integer({ minimum: 1 })),
	fps: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
	codec: Type.Optional(Type.Union([Type.Literal("h264"), Type.Literal("av1")])),
	retention: Type.Optional(Type.Union([Type.Literal("30m"), Type.Literal("2h"), Type.Literal("until-cleared")])),
});

export const RecordingIdInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	recordingId: Type.String({ minLength: 1 }),
});

export const RecordingSampleInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	recordingId: Type.String({ minLength: 1 }),
	atMs: Type.Optional(Type.Array(Type.Integer({ minimum: 0 }))),
	everyMs: Type.Optional(Type.Integer({ exclusiveMinimum: 0 })),
	contactSheetColumns: Type.Optional(Type.Integer({ minimum: 1 })),
});

export const RecordingListInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	projectKey: Type.Optional(Type.String()),
	sessionId: Type.Optional(Type.String()),
	includeExpired: Type.Optional(Type.Boolean()),
});

export const ReviewRecordingInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	recordingId: Type.String({ minLength: 1 }),
	question: Type.String({ minLength: 1, maxLength: 2_048 }),
	model: Type.Optional(Type.String({ minLength: 1 })),
});

export type RecordingStartInput = Static<typeof RecordingStartInputSchema>;
export type RecordingIdInput = Static<typeof RecordingIdInputSchema>;
export type RecordingSampleInput = Static<typeof RecordingSampleInputSchema>;
export type RecordingListInput = Static<typeof RecordingListInputSchema>;
export type ReviewRecordingInput = Static<typeof ReviewRecordingInputSchema>;

export interface RecordingToolSession {
	readonly sessionId: string;
	readonly projectKey: string;
	readonly cwd?: string;
}

export interface RecordingReviewModel {
	readonly model: Model<Api>;
	readonly apiKey?: string;
}

export interface RecordingToolOptions {
	readonly engine: RecordingEngine;
	readonly session: () => RecordingToolSession;
	readonly resolveVideoModel: (requested?: string) => Promise<RecordingReviewModel>;
	readonly directoryFor?: (record: RecordingRecord) => string;
	readonly complete?: typeof completeSimple;
	readonly ffmpegPath?: string;
}

function textResult(text: string, details?: unknown) {
	return { content: [{ type: "text" as const, text }], details };
}

function summarize(record: RecordingRecord): string {
	return JSON.stringify(
		{
			id: record.id,
			status: record.status,
			durationMs: record.durationMs,
			audio: record.audio,
			video: record.video,
			retention: record.retention,
			expiresAt: record.expiresAt,
			error: record.error,
		},
		null,
		2,
	);
}

export function createRecordingStartTool(options: RecordingToolOptions): RuntimeToolDefinition<RecordingStartInput> {
	return {
		name: "recording_start",
		label: "Start recording",
		description:
			"Start an offscreen webpage recording. Returns a RecordingRecord id. Pair with recording_stop, then recording_sample or review_recording.",
		inputSchema: RecordingStartInputSchema,
		async execute({ input, sessionId }) {
			const session = options.session();
			const record = await options.engine.start({
				projectKey: input.projectKey ?? session.projectKey,
				sessionId: sessionId || session.sessionId,
				url: input.url,
				width: input.width,
				height: input.height,
				fps: input.fps,
				codec: input.codec,
				retention: input.retention as RecordingRetention | undefined,
				cwd: session.cwd,
			});
			return textResult(`recording_start ok\n${summarize(record)}`, record);
		},
	};
}

export function createRecordingStopTool(options: RecordingToolOptions): RuntimeToolDefinition<RecordingIdInput> {
	return {
		name: "recording_stop",
		label: "Stop recording",
		description: "Stop an active recording and finalize the MP4, telemetry, and input script.",
		inputSchema: RecordingIdInputSchema,
		async execute({ input }) {
			const record = await options.engine.stop(input.recordingId);
			return textResult(`recording_stop ${record.status}\n${summarize(record)}`, record);
		},
	};
}

export function createRecordingSampleTool(options: RecordingToolOptions): RuntimeToolDefinition<RecordingSampleInput> {
	return {
		name: "recording_sample",
		label: "Sample recording",
		description: "Extract PNG frames (and optional contact sheet) from a ready recording MP4.",
		inputSchema: RecordingSampleInputSchema,
		async execute({ input }) {
			const result = await options.engine.sample({
				recordingId: input.recordingId,
				atMs: input.atMs,
				everyMs: input.everyMs,
				contactSheet: input.contactSheetColumns ? { columns: input.contactSheetColumns } : undefined,
			});
			return textResult(`recording_sample ok — ${result.frames.length} frames`, result);
		},
	};
}

export function createRecordingReadTool(options: RecordingToolOptions): RuntimeToolDefinition<RecordingIdInput> {
	return {
		name: "recording_read",
		label: "Read recording",
		description: "Read recording metadata and local video path. Does not inline the MP4 into the transcript.",
		inputSchema: RecordingIdInputSchema,
		async execute({ input }) {
			const record = await options.engine.read(input.recordingId);
			return textResult(`recording_read\n${summarize(record)}`, record);
		},
	};
}

export function createRecordingListTool(options: RecordingToolOptions): RuntimeToolDefinition<RecordingListInput> {
	return {
		name: "recording_list",
		label: "List recordings",
		description: "List recordings for the current project or session.",
		inputSchema: RecordingListInputSchema,
		async execute({ input }) {
			const session = options.session();
			const records = await options.engine.list({
				projectKey: input.projectKey ?? session.projectKey,
				sessionId: input.sessionId,
				includeExpired: input.includeExpired,
			});
			return textResult(`recording_list ${records.length}\n${records.map(summarize).join("\n")}`, records);
		},
	};
}

export function createRecordingClearTool(options: RecordingToolOptions): RuntimeToolDefinition<RecordingIdInput> {
	return {
		name: "recording_clear",
		label: "Clear recording",
		description: "Delete a recording and its managed files. until-cleared records require this explicit clear.",
		inputSchema: RecordingIdInputSchema,
		async execute({ input }) {
			await options.engine.clear(input.recordingId);
			return textResult(`recording_clear ok ${input.recordingId}`);
		},
	};
}

export function estimateVideoPromptTokens(durationMs: number, question: string): number {
	const sampledFrames = Math.max(1, Math.ceil(durationMs / 1_000));
	return sampledFrames * 258 + Math.ceil(question.length / 4) + TEXT_TOKEN_ALLOWANCE;
}

export async function buildReviewVideoPart(
	record: RecordingRecord,
	directory: string,
	ffmpegPath?: string,
): Promise<{ part: VideoContent; bytes: number }> {
	if (!record.video) throw new Error("Recording has no video artifact");
	const videoPath = join(directory, record.video.path);
	let reviewPath = videoPath;
	let size = (await stat(videoPath)).size;
	if (size > REVIEW_RECORDING_BUDGET_BYTES) {
		if (!ffmpegPath) {
			throw new Error(
				`Recording exceeds the 128 MiB review budget (${size} bytes). Sample frames with recording_sample instead.`,
			);
		}
		const transcoded = await transcodeRecordingForReview({
			ffmpegPath,
			inputPath: videoPath,
			outputPath: join(directory, "review.mp4"),
			maxBytes: REVIEW_RECORDING_BUDGET_BYTES,
		});
		reviewPath = transcoded.path;
		size = transcoded.bytes;
	}
	const data = (await readFile(reviewPath)).toString("base64");
	return {
		bytes: size,
		part: {
			type: "video",
			mimeType: "video/mp4",
			data,
			durationMs: record.durationMs,
		},
	};
}

export function createReviewRecordingTool(options: RecordingToolOptions): RuntimeToolDefinition<ReviewRecordingInput> {
	return {
		name: "review_recording",
		label: "Review recording",
		description:
			"Send a ready recording MP4 to a video-capable model (Gemini by default). Refuses WebM and bodies over 128 MiB. Findings cite recording:<id>; they are not an Evaluation verdict.",
		inputSchema: ReviewRecordingInputSchema,
		async execute({ input }) {
			const record = await options.engine.read(input.recordingId);
			if (record.status !== "ready" || !record.video) throw new Error("Recording is not ready to review");
			if (record.video.mimeType.includes("webm")) throw new Error("WebM is not supported for review_recording");
			const directory = options.directoryFor?.(record);
			if (!directory) throw new Error("Recording directory is unavailable");
			const { part, bytes } = await buildReviewVideoPart(record, directory, options.ffmpegPath);
			const { model, apiKey } = await options.resolveVideoModel(input.model);
			if (!model.input.includes("video") && !model.capabilities?.input.includes("video")) {
				throw new Error(`Model ${model.provider}/${model.id} does not declare video input`);
			}
			const question = input.question.trim();
			const estimated = estimateVideoPromptTokens(record.durationMs ?? 0, question);
			const content: UserContentPart[] = [
				{
					type: "text",
					text: `Review recording:${record.id} (${bytes} bytes, ${record.durationMs ?? 0} ms). ${question}\nDefault sampling is 1 frame per second. Small fast objects can be missed.`,
				},
				part,
			];
			const complete = options.complete ?? completeSimple;
			const response = await complete(
				model,
				{ messages: [{ role: "user", content, timestamp: Date.now() }] },
				{ apiKey },
			);
			const text = response.content
				.filter((block) => block.type === "text")
				.map((block) => block.text)
				.join("\n");
			const usageTokens = response.usage.input + response.usage.output;
			if (usageTokens < estimated * 0.25) {
				return textResult(
					`review_recording refused: token usage ${usageTokens} is below the conservative video-consumption check (${estimated}). The model likely did not receive the video.`,
					{ recordingId: record.id, usage: response.usage, estimated },
				);
			}
			return textResult(text || "(empty review)", {
				recordingId: record.id,
				subject: `recording:${record.id}`,
				usage: response.usage,
			});
		},
	};
}
