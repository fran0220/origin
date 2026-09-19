import {
	DIAL_MODES,
	type DialMode,
	isDialMode,
	isThreadIntent,
	THREAD_INTENTS,
	type ThreadIntent,
} from "@origin/runtime-core";
import type { RuntimeToolDefinition } from "@origin/runtime-core/kernel";
import { ToolCallDescriptionSchema } from "@origin/runtime-tools/coding";
import { type Static, Type } from "@sinclair/typebox";
import type { CodingAgentThreadToolHost } from "./contracts.js";

export const CREATE_THREAD_TOOL_NAME = "create_thread";
export const SEND_THREAD_MESSAGE_TOOL_NAME = "send_thread_message";
export const WAIT_FOR_THREADS_TOOL_NAME = "wait_for_threads";
export const FIND_THREAD_TOOL_NAME = "find_thread";
export const READ_THREAD_TOOL_NAME = "read_thread";

const IntentSchema = Type.Union(THREAD_INTENTS.map((intent) => Type.Literal(intent)));
const DialSchema = Type.Union(DIAL_MODES.map((mode) => Type.Literal(mode)));

export const CreateThreadInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	prompt: Type.String({ minLength: 1, description: "Initial instructions for the new thread." }),
	intent: IntentSchema,
	dial_mode: Type.Optional(DialSchema),
	cwd: Type.Optional(Type.String({ description: "Optional working directory. Omit to share the current cwd." })),
	request_reply: Type.Optional(
		Type.Boolean({
			description:
				"If true (default), the child should message this thread when done. Then do not wait_for_threads.",
		}),
	),
});
export type CreateThreadInput = Static<typeof CreateThreadInputSchema>;

export const SendThreadMessageInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	thread_id: Type.String({ minLength: 1 }),
	message: Type.String({ minLength: 1 }),
	wake: Type.Optional(Type.Boolean({ description: "Start or continue the target turn. Default true." })),
	request_reply: Type.Optional(Type.Boolean()),
});
export type SendThreadMessageInput = Static<typeof SendThreadMessageInputSchema>;

export const WaitForThreadsInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	thread_ids: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
	timeout_ms: Type.Optional(Type.Number()),
});
export type WaitForThreadsInput = Static<typeof WaitForThreadsInputSchema>;

export const FindThreadInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	query: Type.String({ minLength: 1, description: "Keywords or a parent:threadId filter." }),
});
export type FindThreadInput = Static<typeof FindThreadInputSchema>;

export const ReadThreadInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	thread_id: Type.String({ minLength: 1 }),
	question: Type.String({ minLength: 1, description: "What to extract from that thread." }),
});
export type ReadThreadInput = Static<typeof ReadThreadInputSchema>;

export function createCreateThreadTool(host: CodingAgentThreadToolHost): RuntimeToolDefinition<CreateThreadInput> {
	return {
		name: CREATE_THREAD_TOOL_NAME,
		label: CREATE_THREAD_TOOL_NAME,
		description: [
			"Start an independent Thread for work that can proceed without constantly coordinating on the same files.",
			"Returns immediately with thread_id. The new thread has its own conversation and context.",
			"If request_reply is true (default), ask it to report back here and do NOT call wait_for_threads on it.",
			"Keep work in this thread when tasks edit the same files or need constant coordination.",
			"Use spawn_agent(explorer) for cheap read-only reconnaissance instead of a full thread.",
		].join("\n"),
		inputSchema: CreateThreadInputSchema,
		async execute({ input, sessionId }) {
			const coordinator = requireCoordinator(host);
			if (!isThreadIntent(input.intent)) throw new Error(`Unknown intent: ${input.intent}`);
			const dialMode: DialMode | undefined =
				input.dial_mode && isDialMode(input.dial_mode) ? input.dial_mode : undefined;
			const intent: ThreadIntent = input.intent;
			const created = await coordinator.createThread({
				parentThreadId: sessionId,
				intent,
				prompt: input.prompt,
				dialMode,
				cwd: input.cwd,
				requestReply: input.request_reply !== false,
			});
			const replyNote =
				input.request_reply === false
					? "You may wait_for_threads on this id if you need a join point."
					: "Do not wait_for_threads on this id; continue work and handle the inbound <thread_message>.";
			return {
				content: [
					{
						type: "text",
						text: [`Started thread ${created.threadId}.`, replyNote].join("\n"),
					},
				],
				details: created,
			};
		},
	};
}

export function createSendThreadMessageTool(
	host: CodingAgentThreadToolHost,
): RuntimeToolDefinition<SendThreadMessageInput> {
	return {
		name: SEND_THREAD_MESSAGE_TOOL_NAME,
		label: SEND_THREAD_MESSAGE_TOOL_NAME,
		description:
			"Send a message to another Thread. Returns as soon as the message is accepted. Does not transfer files.",
		inputSchema: SendThreadMessageInputSchema,
		async execute({ input, sessionId }) {
			const posted = await requireCoordinator(host).postMessage({
				fromThreadId: sessionId,
				toThreadId: input.thread_id,
				message: input.message,
				wake: input.wake,
				requestReply: input.request_reply,
			});
			return {
				content: [
					{
						type: "text",
						text: posted.queued
							? `Queued message for ${posted.toThreadId}.`
							: `Delivered message to ${posted.toThreadId}.`,
					},
				],
				details: posted,
			};
		},
	};
}

export function createWaitForThreadsTool(host: CodingAgentThreadToolHost): RuntimeToolDefinition<WaitForThreadsInput> {
	return {
		name: WAIT_FOR_THREADS_TOOL_NAME,
		label: WAIT_FOR_THREADS_TOOL_NAME,
		description: [
			"Wait until the named threads are settled (idle, awaiting approval, or error).",
			"Idle is not success — read_thread if you need the result.",
			"Refuse to wait for a thread you already asked to reply here.",
		].join("\n"),
		inputSchema: WaitForThreadsInputSchema,
		async execute({ input, sessionId }) {
			try {
				const waited = await requireCoordinator(host).wait({
					waiterThreadId: sessionId,
					targets: input.thread_ids,
					timeoutMs: input.timeout_ms,
				});
				const lines = waited.settled.map((item) => `${item.threadId}: ${item.running ? "running" : "settled"}`);
				return {
					content: [
						{
							type: "text",
							text: [
								waited.timedOut ? "wait_for_threads timed out:" : "wait_for_threads settled:",
								...lines,
							].join("\n"),
						},
					],
					details: waited,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { content: [{ type: "text", text: message }] };
			}
		},
	};
}

export function createFindThreadTool(host: CodingAgentThreadToolHost): RuntimeToolDefinition<FindThreadInput> {
	return {
		name: FIND_THREAD_TOOL_NAME,
		label: FIND_THREAD_TOOL_NAME,
		description: "List child threads of this conversation. Query may be keywords or parent:<id>.",
		inputSchema: FindThreadInputSchema,
		async execute({ input, sessionId }) {
			const coordinator = requireCoordinator(host);
			const parentId = input.query.startsWith("parent:") ? input.query.slice("parent:".length).trim() : sessionId;
			const matches = coordinator.listChildren(parentId).filter((child) => {
				if (input.query.startsWith("parent:")) return true;
				const haystack = `${child.threadId} ${child.intent ?? ""} ${child.dialMode ?? ""}`.toLowerCase();
				return haystack.includes(input.query.toLowerCase());
			});
			if (matches.length === 0) {
				return { content: [{ type: "text", text: "No matching threads." }] };
			}
			return {
				content: [
					{
						type: "text",
						text: matches
							.map(
								(child) => `${child.threadId} intent=${child.intent ?? "n/a"} dial=${child.dialMode ?? "n/a"}`,
							)
							.join("\n"),
					},
				],
				details: { threads: matches },
			};
		},
	};
}

export function createReadThreadTool(host: CodingAgentThreadToolHost): RuntimeToolDefinition<ReadThreadInput> {
	return {
		name: READ_THREAD_TOOL_NAME,
		label: READ_THREAD_TOOL_NAME,
		description: "Extract an answer about another thread from its identity and transcript.",
		inputSchema: ReadThreadInputSchema,
		async execute({ input }) {
			const coordinator = requireCoordinator(host);
			const record = coordinator.readThread(input.thread_id);
			if (!record) {
				return { content: [{ type: "text", text: `Unknown thread: ${input.thread_id}` }] };
			}
			const excerpts = coordinator.readTranscript(input.thread_id);
			const relevant = excerpts.filter((excerpt) =>
				excerpt.text.toLowerCase().includes(input.question.toLowerCase()),
			);
			const chosen = (relevant.length > 0 ? relevant : excerpts).slice(-12);
			const transcript =
				chosen.length === 0
					? "(empty transcript)"
					: chosen.map((excerpt) => `${excerpt.role}: ${excerpt.text}`).join("\n");
			return {
				content: [
					{
						type: "text",
						text: [
							`Thread ${record.threadId}`,
							record.parentThreadId ? `parent: ${record.parentThreadId}` : "parent: none",
							`intent: ${record.intent ?? "n/a"}`,
							`dial: ${record.dialMode ?? "n/a"}`,
							`Question: ${input.question}`,
							"Transcript:",
							transcript,
						].join("\n"),
					},
				],
				details: { ...record, excerpts: chosen },
			};
		},
	};
}

function requireCoordinator(host: CodingAgentThreadToolHost) {
	const coordinator = host.getCoordinator();
	if (!coordinator) throw new Error("Thread collaboration is not enabled for this session.");
	return coordinator;
}
