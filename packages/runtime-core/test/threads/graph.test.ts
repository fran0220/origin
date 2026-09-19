import { describe, expect, it } from "vitest";
import { ThreadCollaborationGraph } from "../../src/threads/graph.js";

describe("ThreadCollaborationGraph", () => {
	it("registers parent/child lineage and lists children", () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user", createdAt: 1 });
		graph.register({
			threadId: "child",
			parentThreadId: "root",
			origin: "thread",
			intent: "parallel-work",
			dialMode: "low",
			createdAt: 2,
		});

		expect(graph.childrenOf("root").map((child) => child.threadId)).toEqual(["child"]);
		expect(graph.read("child")?.parentThreadId).toBe("root");
	});

	it("refuses wait when the waiter already asked the target to reply", () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });
		graph.register({ threadId: "child", parentThreadId: "root", origin: "thread" });
		graph.requestReply("root", "child");

		expect(graph.admitWait("root", ["child"])).toMatchObject({
			ok: false,
			reason: "reply_pending",
			threadId: "child",
		});
	});

	it("admits wait for children that were not asked to reply", () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });
		graph.register({ threadId: "a", parentThreadId: "root", origin: "thread" });
		graph.register({ threadId: "b", parentThreadId: "root", origin: "thread" });

		expect(graph.admitWait("root", [])).toEqual({ ok: true, targets: ["a", "b"] });
	});

	it("rejects waiting for an unknown or self target", () => {
		const graph = new ThreadCollaborationGraph();
		graph.register({ threadId: "root", origin: "user" });

		expect(graph.admitWait("root", ["missing"])).toMatchObject({ ok: false, reason: "unknown_target" });
		expect(graph.admitWait("root", ["root"])).toMatchObject({ ok: false, reason: "self_wait" });
	});
});
