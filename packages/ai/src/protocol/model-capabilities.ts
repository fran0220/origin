import { AI_ERROR_CODES, AIError } from "./errors.js";
import type { ImageContent, VideoContent } from "./message.js";

export type ModelInputCapability = "text" | "image" | "file" | "audio" | "video";

export interface ModelCapabilities {
	readonly streaming: boolean;
	readonly tools: boolean;
	readonly structuredOutput: boolean;
	readonly reasoning: boolean;
	readonly parallelToolCalls: boolean;
	readonly input: readonly ModelInputCapability[];
	readonly supportedUrls?: readonly string[];
}

export interface ModelLimits {
	readonly contextWindow: number;
	readonly maxTokens?: number;
}

export function modelAcceptsImage(capabilities: ModelCapabilities): boolean {
	return capabilities.input.includes("image");
}

export function hasImageInput(content: readonly unknown[]): boolean {
	return content.some((part) => isImageContent(part));
}

export function modelAcceptsVideo(capabilities: ModelCapabilities): boolean {
	return capabilities.input.includes("video");
}

export function hasVideoInput(content: readonly unknown[]): boolean {
	return content.some((part) => isVideoContent(part));
}

export function assertModelAcceptsVideo(
	model: {
		readonly id: string;
		readonly provider: string;
		readonly input: readonly ModelInputCapability[];
		readonly capabilities?: { readonly input?: readonly ModelInputCapability[] };
	},
	content: readonly unknown[],
): void {
	if (!hasVideoInput(content)) return;
	if (model.input.includes("video") || model.capabilities?.input?.includes("video")) return;
	throw new AIError(
		AI_ERROR_CODES.UNSUPPORTED_CAPABILITY,
		`Model ${model.provider}/${model.id} does not support video input`,
		{ provider: model.provider, modelId: model.id, retryable: false },
	);
}

function isImageContent(value: unknown): value is ImageContent {
	return (
		typeof value === "object" && value !== null && "type" in value && (value as { type?: unknown }).type === "image"
	);
}

function isVideoContent(value: unknown): value is VideoContent {
	return (
		typeof value === "object" && value !== null && "type" in value && (value as { type?: unknown }).type === "video"
	);
}
