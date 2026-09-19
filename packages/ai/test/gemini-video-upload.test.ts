import { describe, expect, it } from "vitest";
import { AI_ERROR_CODES, AIError } from "../src/protocol/errors.js";
import { type GeminiFileUploader, materializeGeminiVideoUploads } from "../src/providers/google/video-upload.js";
import { GEMINI_INLINE_VIDEO_MAX_BYTES } from "../src/providers/video-content.js";
import type { Context, VideoContent } from "../src/types.js";

function inlineVideo(bytes: number, extras: Partial<VideoContent> = {}): VideoContent {
	const data = "A".repeat(Math.ceil((bytes * 4) / 3));
	return { type: "video", mimeType: "video/mp4", data, durationMs: 1_000, ...extras };
}

describe("Gemini Files API video upload", () => {
	it("leaves small inline videos untouched", async () => {
		const context: Context = {
			messages: [{ role: "user", content: [inlineVideo(16)], timestamp: 1 }],
		};
		const result = await materializeGeminiVideoUploads(context, {
			upload: async () => {
				throw new Error("should not upload");
			},
		});
		expect(result).toBe(context);
	});

	it("uploads oversized inline video and replaces data with fileData uri", async () => {
		const uploaded: string[] = [];
		const uploader: GeminiFileUploader = {
			async upload(params) {
				uploaded.push(params.mimeType);
				expect(params.file.size).toBeGreaterThan(GEMINI_INLINE_VIDEO_MAX_BYTES);
				return { uri: "https://generativelanguage.googleapis.com/files/abc" };
			},
		};
		const oversized = inlineVideo(GEMINI_INLINE_VIDEO_MAX_BYTES + 16);
		const context: Context = {
			messages: [{ role: "user", content: [{ type: "text", text: "watch" }, oversized], timestamp: 1 }],
		};
		const result = await materializeGeminiVideoUploads(context, uploader);
		const part = (result.messages[0] as { content: VideoContent[] }).content[1];
		expect(part).toEqual({
			type: "video",
			mimeType: "video/mp4",
			uri: "https://generativelanguage.googleapis.com/files/abc",
			durationMs: 1_000,
		});
		expect(uploaded).toEqual(["video/mp4"]);
	});

	it("keeps an existing Files API uri without uploading", async () => {
		const context: Context = {
			messages: [
				{
					role: "user",
					content: [
						{ type: "video", mimeType: "video/mp4", uri: "https://generativelanguage.googleapis.com/files/keep" },
					],
					timestamp: 1,
				},
			],
		};
		const result = await materializeGeminiVideoUploads(context, {
			upload: async () => {
				throw new Error("should not upload");
			},
		});
		expect(result).toBe(context);
	});

	it("fails clearly when oversized video has no uploader", async () => {
		const context: Context = {
			messages: [{ role: "user", content: [inlineVideo(GEMINI_INLINE_VIDEO_MAX_BYTES + 16)], timestamp: 1 }],
		};
		try {
			await materializeGeminiVideoUploads(context, undefined);
			throw new Error("expected upload requirement error");
		} catch (error) {
			expect(error).toBeInstanceOf(AIError);
			expect((error as AIError).code).toBe(AI_ERROR_CODES.UNSUPPORTED_CAPABILITY);
		}
	});
});
