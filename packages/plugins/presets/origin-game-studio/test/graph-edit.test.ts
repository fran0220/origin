import { describe, expect, it } from "vitest";
import { applyDesignEdit } from "../src/design/graph";
import { emptyGraph, type DesignNode } from "../src/design/types";

function node(partial: Pick<DesignNode, "id" | "title" | "choice"> & { group?: string }): DesignNode {
	return {
		kind: "art_direction",
		cut: false,
		specification: emptyGraph("x").brief.specification,
		references: [],
		artifacts: [],
		verification: [],
		sources: [],
		group: partial.group,
		...partial,
	};
}

describe("design graph edits", () => {
	it("choose rejects other open siblings in the group", () => {
		const graph = emptyGraph("idea");
		graph.nodes = [
			node({ id: "dir-a", title: "Painted", choice: "open", group: "direction" }),
			node({ id: "dir-b", title: "Lit 3D", choice: "open", group: "direction" }),
		];
		const next = applyDesignEdit(graph, { action: "choose", node_id: "dir-a" });
		expect(next.nodes.find((item) => item.id === "dir-a")?.choice).toBe("chosen");
		expect(next.nodes.find((item) => item.id === "dir-b")?.choice).toBe("rejected");
	});

	it("refuses choose when a sibling is already chosen", () => {
		const graph = emptyGraph("idea");
		graph.nodes = [
			node({ id: "dir-a", title: "Painted", choice: "chosen", group: "direction" }),
			node({ id: "dir-b", title: "Lit 3D", choice: "open", group: "direction" }),
		];
		expect(() => applyDesignEdit(graph, { action: "choose", node_id: "dir-b" })).toThrow(/already Chosen/);
	});
});
