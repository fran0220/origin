import { describe, expect, it } from "vitest";
import { AI_ERROR_CODES, AIError } from "../src/protocol/errors.js";
import { convertBedrockMessages } from "../src/providers/amazon-bedrock/messages.js";
import { convertMessages as convertAnthropicMessages } from "../src/providers/anthropic/messages.js";
import { convertMessages as convertGoogleMessages } from "../src/providers/google-shared.js";
import { convertMessages as convertOpenAICompletionsMessages } from "../src/providers/openai-completions/messages.js";
import { convertResponsesMessages } from "../src/providers/openai-responses/messages.js";
import { GEMINI_INLINE_VIDEO_MAX_BYTES, geminiVideoPart } from "../src/providers/video-content.js";
import type { Context, Model, OpenAICompletionsCompat } from "../src/types.js";

const videoPart = {
	type: "video" as const,
	mimeType: "video/mp4",
	data: "ZmFrZQ==",
	durationMs: 1_000,
};

const geminiModel: Model<"google-generative-ai"> = {
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

const videoUserContext: Context = {
	messages: [
		{
			role: "user",
			content: [{ type: "text", text: "watch" }, videoPart],
			timestamp: 1,
		},
	],
};

const completionsCompat: Required<OpenAICompletionsCompat> = {
	supportsStore: true,
	supportsDeveloperRole: true,
	supportsReasoningEffort: true,
	supportsUsageInStreaming: true,
	maxTokensField: "max_completion_tokens",
	requiresToolResultName: false,
	requiresAssistantAfterToolResult: false,
	requiresThinkingAsText: false,
	requiresMistralToolIds: false,
	thinkingFormat: "openai",
	openRouterRouting: {},
	vercelGatewayRouting: {},
	supportsStrictMode: true,
};

function expectUnsupportedVideo(run: () => unknown): void {
	try {
		run();
		throw new Error("expected video conversion to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(AIError);
		expect((error as AIError).code).toBe(AI_ERROR_CODES.UNSUPPORTED_CAPABILITY);
	}
}

describe("Gemini video parts", () => {
	it("maps inline base64 video to Gemini inlineData", () => {
		expect(geminiVideoPart(videoPart)).toEqual({
			inlineData: { mimeType: "video/mp4", data: "ZmFrZQ==" },
		});
		const contents = convertGoogleMessages(geminiModel, videoUserContext);
		expect(contents[0]?.parts).toEqual([
			{ text: "watch" },
			{ inlineData: { mimeType: "video/mp4", data: "ZmFrZQ==" } },
		]);
	});

	it("maps Files API uri to Gemini fileData", () => {
		const uriPart = {
			type: "video" as const,
			mimeType: "video/mp4",
			uri: "https://generativelanguage.googleapis.com/files/abc",
		};
		expect(geminiVideoPart(uriPart)).toEqual({
			fileData: { fileUri: uriPart.uri, mimeType: "video/mp4" },
		});
		const contents = convertGoogleMessages(geminiModel, {
			messages: [{ role: "user", content: [uriPart], timestamp: 1 }],
		});
		expect(contents[0]?.parts).toEqual([{ fileData: { fileUri: uriPart.uri, mimeType: "video/mp4" } }]);
	});

	it("maps tool-result video onto Gemini function response media", () => {
		const contents = convertGoogleMessages(geminiModel, {
			messages: [
				{
					role: "toolResult",
					toolCallId: "call-1",
					toolName: "recording_read",
					content: [videoPart],
					isError: false,
					timestamp: 1,
				},
			],
		});
		expect(contents.some((entry) => entry.parts?.some((part) => "inlineData" in part))).toBe(true);
	});

	it("refuses inline video larger than 20 MiB", () => {
		const oversized = "A".repeat(Math.ceil(((GEMINI_INLINE_VIDEO_MAX_BYTES + 1) * 4) / 3));
		expect(() => geminiVideoPart({ type: "video", mimeType: "video/mp4", data: oversized })).toThrow(AIError);
	});

	it("refuses video on Gemini models that do not declare video input", () => {
		expectUnsupportedVideo(() =>
			convertGoogleMessages({ ...geminiModel, input: ["text", "image"] }, videoUserContext),
		);
	});
});

describe("non-Gemini providers reject video parts", () => {
	it("rejects Anthropic conversion", () => {
		const model: Model<"anthropic-messages"> = {
			id: "claude-sonnet-4-5",
			name: "Claude Sonnet 4.5",
			api: "anthropic-messages",
			provider: "anthropic",
			baseUrl: "https://api.anthropic.com",
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200_000,
			maxTokens: 64_000,
		};
		expectUnsupportedVideo(() => convertAnthropicMessages(videoUserContext.messages, model, false));
	});

	it("rejects OpenAI Completions conversion", () => {
		const model: Model<"openai-completions"> = {
			id: "gpt-4o-mini",
			name: "GPT-4o mini",
			api: "openai-completions",
			provider: "openai",
			baseUrl: "https://api.openai.com/v1",
			reasoning: false,
			input: ["text", "image"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128_000,
			maxTokens: 16_384,
		};
		expectUnsupportedVideo(() => convertOpenAICompletionsMessages(model, videoUserContext, completionsCompat));
	});

	it("rejects OpenAI Responses conversion", () => {
		const model: Model<"openai-responses"> = {
			id: "gpt-5-mini",
			name: "GPT-5 mini",
			api: "openai-responses",
			provider: "openai",
			baseUrl: "https://api.openai.com/v1",
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128_000,
			maxTokens: 16_384,
		};
		expectUnsupportedVideo(() => convertResponsesMessages(model, videoUserContext, new Set(["openai"])));
	});

	it("rejects Amazon Bedrock conversion", () => {
		const model: Model<"bedrock-converse-stream"> = {
			id: "anthropic.claude-sonnet-4",
			name: "Claude Sonnet 4",
			api: "bedrock-converse-stream",
			provider: "amazon-bedrock",
			baseUrl: "https://bedrock.us-east-1.amazonaws.com",
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200_000,
			maxTokens: 8_192,
		};
		expectUnsupportedVideo(() => convertBedrockMessages(videoUserContext, model, "none"));
	});
});
