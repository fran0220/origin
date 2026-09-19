import {
	type DialMode,
	type PromptRequest,
	type RuntimeHost,
	RuntimeThreadCoordinator,
	type RuntimeTurnPromptOutcome,
	type ThreadIntent,
	type ThreadOrigin,
} from "@vetta/runtime-core";
import { getAppLogger } from "../logger.js";

const log = getAppLogger("thread-coordinator");

/**
 * Desktop 把 RuntimeHost 接到 Thread 协作控制面。
 *
 * 子 Thread 必须走 {@link getDesktopConversationService}：否则没有 sessionDir / agentMode /
 * 列表事件，用户看不到、也无法继续这条会话。
 */
export function createDesktopThreadCoordinator(host: RuntimeHost): RuntimeThreadCoordinator {
	return new RuntimeThreadCoordinator({
		graph: host.threads,
		sessions: {
			async createSession(input: {
				readonly parentThreadId: string;
				readonly intent: ThreadIntent;
				readonly dialMode?: DialMode;
				readonly cwd?: string;
				readonly origin: ThreadOrigin;
			}): Promise<{ readonly threadId: string }> {
				const parentCwd = host.readSessionWorkingDirectory(input.parentThreadId);
				const { getDesktopConversationService } = await import("../conversations/desktop-conversation-service.js");
				const conversations = getDesktopConversationService();
				const kind = conversations.classifyWorkingDirectory(input.cwd ?? parentCwd ?? process.cwd());
				const created = await conversations.createSession(
					{
						cwd: input.cwd ?? parentCwd,
						parentThreadId: input.parentThreadId,
						threadOrigin: input.origin,
						threadIntent: input.intent,
						dialMode: input.dialMode,
					},
					kind,
					"interactive",
				);
				return { threadId: created.sessionId };
			},
			prompt(threadId: string, request: PromptRequest): Promise<RuntimeTurnPromptOutcome> {
				return host.prompt(threadId, request).catch((error: unknown) => {
					log.warn("child thread prompt failed", {
						threadId,
						message: error instanceof Error ? error.message : String(error),
					});
					return { status: "failed" as const };
				});
			},
			async queueIfRunning(threadId: string, request: PromptRequest) {
				const queued = await host.queuePromptIfRunning(threadId, request);
				return { queued: queued.status === "queued" };
			},
			isRunning(threadId: string) {
				try {
					return host.getState(threadId).isStreaming;
				} catch {
					return false;
				}
			},
			readTranscript(threadId: string) {
				try {
					return host.getMessages(threadId).flatMap((message) => {
						const text = transcriptText(message);
						return text ? [{ role: message.role, text }] : [];
					});
				} catch {
					return [];
				}
			},
		},
	});
}

function transcriptText(message: { readonly role: string; readonly content: unknown }): string {
	if (typeof message.content === "string") return message.content.trim();
	if (!Array.isArray(message.content)) return "";
	return message.content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			if ("text" in part && typeof part.text === "string") return part.text;
			if ("thinking" in part && typeof part.thinking === "string") return "";
			return "";
		})
		.filter((part) => part.trim().length > 0)
		.join("\n")
		.trim();
}
