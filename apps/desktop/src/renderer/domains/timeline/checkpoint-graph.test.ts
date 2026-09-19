import type { MainlineCheckpoint } from "@vetta/runtime-checkpoints";
import { describe, expect, it } from "vitest";
import { projectCheckpointGraph } from "./checkpoint-graph";

function checkpoint(overrides: Partial<MainlineCheckpoint>): MainlineCheckpoint {
	return {
		recordType: "checkpoint.mainline",
		schemaVersion: 1,
		id: "cp_a",
		operationId: "turn:s:t1",
		projectKey: "home",
		sessionId: "s",
		turnId: "t1",
		intent: "first",
		createdAt: 1,
		updatedAt: 1,
		verification: [],
		phase: "settled",
		decision: "kept",
		...overrides,
	};
}

describe("projectCheckpointGraph", () => {
	it("draws parent edges and a feedback edge for revert", () => {
		const first = checkpoint({
			id: "cp_a",
			landed: { commit: "aaa", parent: null, paths: ["a"], added: 1, removed: 0 },
		});
		const second = checkpoint({
			id: "cp_b",
			operationId: "turn:s:t2",
			intent: "second",
			createdAt: 2,
			landed: { commit: "bbb", parent: "aaa", paths: ["a"], added: 1, removed: 1 },
			decision: "reverted",
			revertedBy: { commit: "ccc", parent: "bbb", paths: ["a"], added: 1, removed: 1 },
		});
		const graph = projectCheckpointGraph([first, second]);
		expect(graph.nodes.map((node) => node.hash)).toEqual(["bbb", "aaa", "revert:ccc"]);
		expect(graph.feedbackEdges).toEqual([{ fromHash: "revert:ccc", toHash: "bbb" }]);
	});
});
