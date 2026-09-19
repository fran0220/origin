import { AI_ERROR_CODES, AIError } from "../protocol/errors.js";
import type { ImageContent, TextContent, VideoContent } from "../protocol/message.js";
import type { ModelInputCapability } from "../protocol/model-capabilities.js";
import { assertModelAcceptsVideo } from "../protocol/model-capabilities.js";

/** Gemini inlineData budget for video parts. Larger clips must use Files API `uri`. */
export const GEMINI_INLINE_VIDEO_MAX_BYTES = 20 * 1024 * 1024;

export function isVideoContent(value: unknown): value is VideoContent {
	return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "video";
}

export function collectMessageParts(content: unknown): readonly unknown[] {
	if (typeof content === "string") return [];
	if (!Array.isArray(content)) return [];
	return content;
}

export function messageHasVideo(messages: readonly { readonly role: string; readonly content?: unknown }[]): boolean {
	return messages.some((message) => {
		if (message.role !== "user" && message.role !== "toolResult") return false;
		return collectMessageParts(message.content).some(isVideoContent);
	});
}

export function assertNoUnsupportedVideo(
	model: {
		readonly id: string;
		readonly provider: string;
		readonly api: string;
		readonly input: readonly ModelInputCapability[];
		readonly capabilities?: { readonly input: readonly ModelInputCapability[] };
	},
	messages: readonly { readonly role: string; readonly content?: unknown }[],
): void {
	const parts: unknown[] = [];
	for (const message of messages) {
		if (message.role !== "user" && message.role !== "toolResult") continue;
		parts.push(...collectMessageParts(message.content));
	}
	if (!parts.some(isVideoContent)) return;
	assertModelAcceptsVideo(model, parts);
}

export function rejectUnsupportedVideo(model: {
	readonly id: string;
	readonly provider: string;
	readonly api: string;
}): never {
	throw new AIError(
		AI_ERROR_CODES.UNSUPPORTED_CAPABILITY,
		`Provider ${model.provider} (${model.api}) does not support video input parts`,
		{ provider: model.provider, modelId: model.id, retryable: false },
	);
}

export function rejectVideoIfPresent(
	model: { readonly id: string; readonly provider: string; readonly api: string },
	messages: readonly { readonly role: string; readonly content?: unknown }[] | undefined,
): void {
	if (!messages || !messageHasVideo(messages)) return;
	rejectUnsupportedVideo(model);
}

export function decodedVideoByteLength(video: VideoContent): number {
	if (typeof video.data === "string" && video.data.length > 0) {
		return Math.floor((video.data.length * 3) / 4);
	}
	return 0;
}

export function geminiVideoPart(video: VideoContent): {
	inlineData?: { mimeType: string; data: string };
	fileData?: { fileUri: string; mimeType: string };
} {
	if (typeof video.uri === "string" && video.uri.length > 0) {
		return { fileData: { fileUri: video.uri, mimeType: video.mimeType } };
	}
	if (typeof video.data !== "string" || video.data.length === 0) {
		throw new AIError(AI_ERROR_CODES.INVALID_REQUEST, "Video part requires either base64 data or a Files API uri", {
			retryable: false,
		});
	}
	if (decodedVideoByteLength(video) > GEMINI_INLINE_VIDEO_MAX_BYTES) {
		throw new AIError(
			AI_ERROR_CODES.INVALID_REQUEST,
			`Video inlineData exceeds ${GEMINI_INLINE_VIDEO_MAX_BYTES} bytes; upload via Files API and set uri`,
			{ retryable: false },
		);
	}
	return { inlineData: { mimeType: video.mimeType, data: video.data } };
}

export type MediaUserPart = TextContent | ImageContent | VideoContent;
