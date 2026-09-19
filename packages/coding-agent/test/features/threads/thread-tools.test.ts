import { RuntimeThreadCoordinator, ThreadCollaborationGraph } from "@vetta/runtime-core";
import { describe, expect, it } from "vitest";
import {
	createCreateThreadTool,
	createReadThreadTool,
	createSendThreadMessageTool,
	createWaitForThreadsTool,
} from "../../../src/features/threads/thread-tools.js";

describe("thread collaboration tools", () => {
	it("create_thread returns immediately and refuses a later wait on the same child", async () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });
		const createdIds: string[] = [];
		const coordinator = new RuntimeThreadCoordinator({
			graph,
			sessions: {
				async createSession() {
					createdIds.push("child-1");
					return { threadId: "child-1" };
				},
				async prompt() {
					return { status: "completed" };
				},
				async queueIfRunning() {
					return { queued: false };
				},
				isRunning: () => false,
			},
		});
		const host = { getCoordinator: () => coordinator };
		const created = await createCreateThreadTool(host).execute({
			input: {
				description: "delegate",
				prompt: "Investigate the unrelated bug.",
				intent: "delegation",
			},
			sessionId: "root",
			turnId: "turn-1",
			toolCallId: "call-1",
			signal: new AbortController().signal,
		});
		expect(created.content[0]).toMatchObject({
			type: "text",
		});
		expect(String((created.content[0] as { text: string }).text)).toContain("Started thread child-1");
		expect(String((created.content[0] as { text: string }).text)).toContain("Do not wait_for_threads");

		const waited = await createWaitForThreadsTool(host).execute({
			input: { description: "join", thread_ids: ["child-1"] },
			sessionId: "root",
			turnId: "turn-2",
			toolCallId: "call-2",
			signal: new AbortController().signal,
		});
		expect(String((waited.content[0] as { text: string }).text)).toContain("reply_pending");
	});

	it("send_thread_message delivers without files and can wait when reply was not requested", async () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });
		graph.register({ threadId: "child-1", parentThreadId: "root", origin: "thread" });
		const prompts: string[] = [];
		const coordinator = new RuntimeThreadCoordinator({
			graph,
			sessions: {
				async createSession() {
					return { threadId: "unused" };
				},
				async prompt(_threadId, request) {
					prompts.push(request.text);
					return { status: "completed" };
				},
				async queueIfRunning() {
					return { queued: false };
				},
				isRunning: () => false,
			},
		});
		const host = { getCoordinator: () => coordinator };
		const posted = await createSendThreadMessageTool(host).execute({
			input: { description: "nudge", thread_id: "child-1", message: "Please stay on the original files." },
			sessionId: "root",
			turnId: "turn-3",
			toolCallId: "call-3",
			signal: new AbortController().signal,
		});
		expect(String((posted.content[0] as { text: string }).text)).toContain("Delivered message to child-1");
		expect(prompts[0]).toContain('<thread_message from="root">');
		expect(prompts[0]).not.toContain("file://");

		const waited = await createWaitForThreadsTool(host).execute({
			input: { description: "join", thread_ids: ["child-1"] },
			sessionId: "root",
			turnId: "turn-4",
			toolCallId: "call-4",
			signal: new AbortController().signal,
		});
		expect(String((waited.content[0] as { text: string }).text)).toContain("settled");
	});

	it("read_thread returns transcript excerpts matching the question", async () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });
		graph.register({ threadId: "child-1", parentThreadId: "root", origin: "thread", intent: "delegation" });
		const coordinator = new RuntimeThreadCoordinator({
			graph,
			sessions: {
				async createSession() {
					return { threadId: "unused" };
				},
				async prompt() {
					return { status: "completed" };
				},
				async queueIfRunning() {
					return { queued: false };
				},
				isRunning: () => false,
				readTranscript: () => [
					{ role: "user", text: "Investigate the login timeout." },
					{ role: "assistant", text: "The timeout is 30s in auth.ts." },
				],
			},
		});
		const read = await createReadThreadTool({ getCoordinator: () => coordinator }).execute({
			input: { description: "extract", thread_id: "child-1", question: "timeout" },
			sessionId: "root",
			turnId: "turn-5",
			toolCallId: "call-5",
			signal: new AbortController().signal,
		});
		expect(String((read.content[0] as { text: string }).text)).toContain("The timeout is 30s in auth.ts.");
		expect(String((read.content[0] as { text: string }).text)).not.toContain("empty transcript");
	});
});
