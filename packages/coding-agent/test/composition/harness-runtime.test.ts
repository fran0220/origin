import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Api, type AssistantMessage, type AssistantMessageEvent, EventStream, type Model } from "@origin/ai";
import { EvolutionLedger, HOST_ORIGIN, MemoryEvolutionLedgerStore, subjectScope } from "@origin/runtime-evolution";
import { afterEach, describe, expect, it } from "vitest";
import type { CodingAgentRuntimeComposition } from "../../src/composition/index.js";
import { createCodingAgentHarnessRuntime } from "../../src/features/harness/index.js";
import type { CodingAgentRuntimeModelSource } from "../../src/public-api/host-services.js";
import { createCodingAgentRuntimeComposition } from "../fixtures/conversation-persistence.js";

const temporaryRoots: string[] = [];
const compositions: CodingAgentRuntimeComposition[] = [];

afterEach(async () => {
	for (const composition of compositions.splice(0).reverse()) await composition.dispose();
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("continual-harness prompt snapshot", () => {
	it("keeps the current Turn system prompt frozen after harness_refine and shows the rule on the next Turn", async () => {
		const workspace = await temporaryRoot("harness-prompt-workspace-");
		const conversations = await temporaryRoot("harness-prompt-conversations-");
		const store = new MemoryEvolutionLedgerStore();
		const ledger = new EvolutionLedger(store);
		const calls: Array<{ readonly systemPrompt: string; readonly tools: readonly string[] }> = [];
		const responses = [
			assistantMessage(
				[
					{
						type: "toolCall",
						id: "harness-1",
						name: "harness_refine",
						arguments: {
							description: "record bazel",
							summary: "keep bazel",
							rationale: "the build used bazel",
							expectedOutcome: "later Turns start from it",
							edits: [
								{
									action: "create",
									entry: {
										id: "bazel",
										kind: "prompt",
										title: "Always bazel",
										content: "This repo builds with bazel.",
									},
								},
							],
						},
					},
				],
				"toolUse",
			),
			assistantMessage([{ type: "text", text: "Recorded the bazel rule." }]),
			assistantMessage([{ type: "text", text: "Following the bazel rule." }]),
		];
		let responseIndex = 0;
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			cwd: workspace,
			enableSubagents: false,
			activation: { mode: "explicit", toolNames: [] },
			createHarnessRuntime: () => createCodingAgentHarnessRuntime({ ledger, subjectId: workspace }),
			resolveSystemPromptOptions: () => ({
				customPrompt: "Harness-enabled Coding Agent",
				scenario: "cli",
			}),
			streamFn: (_model, context) => {
				calls.push({
					systemPrompt: context.systemPrompt ?? "",
					tools: (context.tools ?? []).map(({ name }) => name),
				});
				const response = responses[responseIndex];
				responseIndex += 1;
				if (!response) throw new Error("Missing recorded response");
				return new RecordedAssistantStream(response);
			},
		});
		compositions.push(composition);
		const session = await composition.createSession({ sessionId: "harness-session", cwd: workspace });

		const first = await session.prompt({ text: "Remember that this repo uses bazel" });
		expect(first.status).toBe("completed");
		expect(calls).toHaveLength(2);
		expect(calls[0]?.tools).toEqual(expect.arrayContaining(["harness_refine"]));
		expect(calls[0]?.systemPrompt).not.toContain("<continual_harness>");
		expect(calls[1]?.systemPrompt).not.toContain("<continual_harness>");
		expect(calls[1]?.systemPrompt).not.toContain("This repo builds with bazel.");

		const second = await session.prompt({ text: "What build system should I use?" });
		expect(second.status).toBe("completed");
		expect(calls).toHaveLength(3);
		expect(calls[2]?.systemPrompt).toContain("<continual_harness>");
		expect(calls[2]?.systemPrompt).toContain("This repo builds with bazel.");
		expect(calls[2]?.systemPrompt).toContain("</continual_harness>");
		await session.dispose();
	});

	it("drops a refined rule from the next Turn after the user rolls the event back", async () => {
		const workspace = await temporaryRoot("harness-rollback-workspace-");
		const conversations = await temporaryRoot("harness-rollback-conversations-");
		const store = new MemoryEvolutionLedgerStore();
		const ledger = new EvolutionLedger(store);
		const subject = subjectScope(workspace);
		const recorded = await ledger.record(
			subject,
			{
				summary: "keep bazel",
				rationale: "the build used bazel",
				expectedOutcome: "later Turns start from it",
				edits: [
					{
						action: "create",
						entry: {
							id: "bazel",
							kind: "prompt",
							title: "Always bazel",
							content: "This repo builds with bazel.",
						},
					},
				],
			},
			"refine",
			HOST_ORIGIN,
			1_700_000_300_000,
		);
		const calls: string[] = [];
		const composition = await createCodingAgentRuntimeComposition({
			conversationDir: conversations,
			modelRegistry: modelRegistry(),
			initialModel: MODEL,
			initialThinkingLevel: "off",
			cwd: workspace,
			enableSubagents: false,
			activation: { mode: "explicit", toolNames: [] },
			createHarnessRuntime: () => createCodingAgentHarnessRuntime({ ledger, subjectId: workspace }),
			resolveSystemPromptOptions: () => ({
				customPrompt: "Harness rollback Coding Agent",
				scenario: "cli",
			}),
			streamFn: (_model, context) => {
				calls.push(context.systemPrompt ?? "");
				return new RecordedAssistantStream(assistantMessage([{ type: "text", text: "Noted." }]));
			},
		});
		compositions.push(composition);
		const session = await composition.createSession({ sessionId: "harness-rollback-session", cwd: workspace });

		await session.prompt({ text: "What build system?" });
		expect(calls[0]).toContain("This repo builds with bazel.");

		await ledger.rollback(
			subject,
			recorded.digest,
			"taken back from the harness settings surface",
			HOST_ORIGIN,
			1_700_000_300_100,
		);
		await session.prompt({ text: "And now?" });
		expect(calls[1]).not.toContain("This repo builds with bazel.");
		expect(calls[1]).not.toContain("<continual_harness>");
		await session.dispose();
	});
});

type SuccessfulAssistantMessage = AssistantMessage & { readonly stopReason: "length" | "stop" | "toolUse" };

class RecordedAssistantStream extends EventStream<AssistantMessageEvent, AssistantMessage> {
	constructor(message: SuccessfulAssistantMessage) {
		super(
			(event) => event.type === "done" || event.type === "error",
			(event) => {
				if (event.type === "done") return event.message;
				if (event.type === "error") return event.error;
				throw new Error("Unexpected assistant event");
			},
		);
		queueMicrotask(() => {
			this.push({ type: "done", reason: message.stopReason, message });
		});
	}
}

function modelRegistry(): CodingAgentRuntimeModelSource {
	return {
		refresh() {},
		getAvailable: () => [MODEL],
		find: (provider, modelId) => (provider === MODEL.provider && modelId === MODEL.id ? MODEL : undefined),
		getApiKey: async () => "test-key",
		setServerToken() {},
		loadRemoteModels: async () => undefined,
	};
}

function assistantMessage(
	content: AssistantMessage["content"],
	stopReason: "length" | "stop" | "toolUse" = "stop",
	totalTokens = 2,
): SuccessfulAssistantMessage {
	return {
		role: "assistant",
		content,
		api: MODEL.api,
		provider: MODEL.provider,
		model: MODEL.id,
		usage: {
			input: totalTokens - 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: 2,
	};
}

async function temporaryRoot(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), prefix));
	temporaryRoots.push(root);
	return root;
}

const MODEL: Model<Api> = {
	id: "recorded-model",
	name: "Recorded Model",
	api: "openai-responses",
	provider: "test",
	baseUrl: "https://example.test",
	reasoning: true,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 8_000,
	maxTokens: 1_000,
};
