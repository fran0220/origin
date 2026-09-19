import { describe, expect, it } from "vitest";
import type { PromptRequest, RuntimeTurnPromptOutcome } from "../../src/contracts.js";
import { RuntimeThreadCoordinator, type RuntimeThreadSessionPort } from "../../src/threads/coordinator.js";
import { ThreadCollaborationGraph } from "../../src/threads/graph.js";

describe("RuntimeThreadCoordinator", () => {
	it("creates a child thread, asks it to reply, and starts it without blocking the parent", async () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });
		const sessions = createFakeSessions();
		let releaseChild: (() => void) | undefined;
		sessions.promptHold = new Promise<void>((resolve) => {
			releaseChild = resolve;
		});
		const coordinator = new RuntimeThreadCoordinator({ graph, sessions, now: () => 10 });

		const created = await coordinator.createThread({
			parentThreadId: "root",
			intent: "delegation",
			prompt: "Fix the unrelated bug and report back.",
			dialMode: "low",
		});

		expect(created.threadId).toMatch(/^thread-/);
		expect(sessions.created).toHaveLength(1);
		expect(sessions.prompts).toEqual([
			{ threadId: created.threadId, text: "Fix the unrelated bug and report back." },
		]);
		expect(graph.admitWait("root", [created.threadId]).ok).toBe(false);
		releaseChild?.();
	});

	it("posts an inbound message and queues when the target is already running", async () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });
		graph.register({ threadId: "child", parentThreadId: "root", origin: "thread" });
		const sessions = createFakeSessions();
		sessions.running.add("root");
		const coordinator = new RuntimeThreadCoordinator({ graph, sessions });

		const posted = await coordinator.postMessage({
			fromThreadId: "child",
			toThreadId: "root",
			message: "Done. See the attached findings in prose.",
		});

		expect(posted.queued).toBe(true);
		expect(sessions.queued[0]?.text).toContain('from="child"');
		expect(sessions.queued[0]?.text).toContain("Done. See the attached findings in prose.");
	});

	it("waits until every target is idle using a controllable clock", async () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });
		graph.register({ threadId: "child", parentThreadId: "root", origin: "thread" });
		const sessions = createFakeSessions();
		sessions.running.add("child");
		let now = 0;
		const coordinator = new RuntimeThreadCoordinator({
			graph,
			sessions,
			now: () => now,
			sleep: async () => {
				now += 50;
				sessions.running.delete("child");
			},
		});

		const waited = await coordinator.wait({ waiterThreadId: "root", targets: ["child"], timeoutMs: 1000 });
		expect(waited.timedOut).toBe(false);
		expect(waited.settled).toEqual([{ threadId: "child", running: false }]);
	});

	it("reads a child transcript when the session port exposes one", () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });
		graph.register({ threadId: "child", parentThreadId: "root", origin: "thread" });
		const sessions = createFakeSessions();
		sessions.transcripts.set("child", [{ role: "assistant", text: "shipped" }]);
		const coordinator = new RuntimeThreadCoordinator({ graph, sessions });
		expect(coordinator.readTranscript("child")).toEqual([{ role: "assistant", text: "shipped" }]);
	});
});

function createFakeSessions(): RuntimeThreadSessionPort & {
	created: string[];
	prompts: Array<{ threadId: string; text: string }>;
	queued: PromptRequest[];
	running: Set<string>;
	transcripts: Map<string, Array<{ role: string; text: string }>>;
	promptHold?: Promise<void>;
} {
	let next = 0;
	const created: string[] = [];
	const prompts: Array<{ threadId: string; text: string }> = [];
	const queued: PromptRequest[] = [];
	const running = new Set<string>();
	const transcripts = new Map<string, Array<{ role: string; text: string }>>();
	const fake: RuntimeThreadSessionPort & {
		created: string[];
		prompts: Array<{ threadId: string; text: string }>;
		queued: PromptRequest[];
		running: Set<string>;
		transcripts: Map<string, Array<{ role: string; text: string }>>;
		promptHold?: Promise<void>;
	} = {
		created,
		prompts,
		queued,
		running,
		transcripts,
		async createSession() {
			next += 1;
			const threadId = `thread-${next}`;
			created.push(threadId);
			return { threadId };
		},
		async prompt(threadId, request): Promise<RuntimeTurnPromptOutcome> {
			prompts.push({ threadId, text: request.text });
			if (fake.promptHold) await fake.promptHold;
			return { status: "completed" };
		},
		async queueIfRunning(_threadId, request) {
			queued.push(request);
			return { queued: true };
		},
		isRunning(threadId) {
			return running.has(threadId);
		},
		readTranscript(threadId) {
			return transcripts.get(threadId) ?? [];
		},
	};
	return fake;
}
