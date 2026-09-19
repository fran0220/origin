import type { GoogleGenAI } from "@google/genai";
import { AI_ERROR_CODES, AIError } from "../../protocol/errors.js";
import type { Context, Message, UserContentPart, VideoContent } from "../../types.js";
import { decodedVideoByteLength, GEMINI_INLINE_VIDEO_MAX_BYTES, isVideoContent } from "../video-content.js";

export interface GeminiFileUploader {
	upload(params: { file: Blob; mimeType: string; displayName?: string }): Promise<{ uri: string }>;
}

export function createGeminiFileUploader(client: GoogleGenAI): GeminiFileUploader {
	return {
		async upload(params) {
			const uploaded = await client.files.upload({
				file: params.file,
				config: { mimeType: params.mimeType, displayName: params.displayName },
			});
			if (!uploaded.uri) {
				throw new AIError(AI_ERROR_CODES.INVALID_REQUEST, "Gemini Files API upload did not return a uri", {
					retryable: true,
				});
			}
			return { uri: uploaded.uri };
		},
	};
}

/**
 * Replace oversized inline video parts with Files API URIs so Gemini mapping
 * can emit `fileData` instead of `inlineData`. Parts already carrying `uri`
 * are left untouched. Vertex / clients without `files.upload` fail clearly.
 */
export async function materializeGeminiVideoUploads(
	context: Context,
	uploader: GeminiFileUploader | undefined,
): Promise<Context> {
	let changed = false;
	const messages: Message[] = [];
	for (const message of context.messages) {
		if (message.role !== "user" && message.role !== "toolResult") {
			messages.push(message);
			continue;
		}
		if (!Array.isArray(message.content) || !message.content.some(isVideoContent)) {
			messages.push(message);
			continue;
		}
		const content: UserContentPart[] = [];
		for (const part of message.content) {
			if (!isVideoContent(part) || shouldKeepInlineVideo(part)) {
				content.push(part);
				continue;
			}
			if (!uploader) {
				throw new AIError(
					AI_ERROR_CODES.UNSUPPORTED_CAPABILITY,
					"Gemini Files API upload is required for video parts larger than 20 MiB",
					{ retryable: false },
				);
			}
			content.push(await uploadInlineVideo(part, uploader));
			changed = true;
		}
		messages.push({ ...message, content });
	}
	return changed ? { ...context, messages } : context;
}

function shouldKeepInlineVideo(video: VideoContent): boolean {
	if (typeof video.uri === "string" && video.uri.length > 0) return true;
	if (typeof video.data !== "string" || video.data.length === 0) return true;
	return decodedVideoByteLength(video) <= GEMINI_INLINE_VIDEO_MAX_BYTES;
}

async function uploadInlineVideo(video: VideoContent, uploader: GeminiFileUploader): Promise<VideoContent> {
	const bytes = decodeBase64(video.data ?? "");
	const blob = new Blob([bytes], { type: video.mimeType });
	const { uri } = await uploader.upload({
		file: blob,
		mimeType: video.mimeType,
		displayName: `vetta-video-${video.durationMs ?? "clip"}`,
	});
	return { type: "video", mimeType: video.mimeType, uri, durationMs: video.durationMs };
}

function decodeBase64(data: string): Uint8Array {
	const buffer = Buffer.from(data, "base64");
	return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
