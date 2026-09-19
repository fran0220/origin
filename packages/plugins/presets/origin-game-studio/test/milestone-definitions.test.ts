import { describe, expect, it } from "vitest";
import type { DesignGraph } from "../src/design/types";
import {
	GREYBOX_PLAYBACK_EXPRESSION,
	GREYBOX_TICK_EXPRESSION,
	definitionsFromGraph,
} from "../src/milestones/definitions";

const graph: DesignGraph = {
	version: 2,
	brief: {
		intent: "a maze",
		scope: [],
		outOfScope: [],
		specification: {
			sections: [],
			criteria: [],
			journeyNodes: [],
			knowledge: [],
			constraints: [],
			route: null,
		},
	},
	substrate: "canvas2d",
	milestones: [
		{ id: "greybox", title: "First playable", kind: "greybox", nodeIds: ["player"] },
		{ id: "delivery", title: "Delivery", kind: "delivery", nodeIds: [] },
	],
	nodes: [
		{
			id: "player",
			kind: "entity",
			title: "Player",
			choice: "open",
			cut: false,
			specification: { sections: [], criteria: [], journeyNodes: [], knowledge: [], constraints: [] },
			references: [],
			artifacts: [],
			verification: [],
			sources: [],
		},
	],
	edges: [],
};

describe("milestone evaluation definitions", () => {
	it("emits spawn-safe command verifiers with the project cwd and platform assertion JSON", () => {
		const [greybox, delivery] = definitionsFromGraph(graph, "/tmp/harbour-run");
		const commands = greybox?.criteria.filter((criterion) => criterion.verifier?.kind === "command") ?? [];
		expect(commands.every((criterion) => criterion.verifier?.kind === "command")).toBe(true);
		expect(commands.map((criterion) => criterion.verifier)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: "command", command: "bun", args: ["run", "typecheck"], cwd: "/tmp/harbour-run" }),
				expect.objectContaining({ kind: "command", command: "bun", args: ["run", "build"], cwd: "/tmp/harbour-run" }),
			]),
		);
		expect(commands.some((criterion) => typeof (criterion.verifier as { command?: string }).command === "string" && (criterion.verifier as { command: string }).command.includes(" "))).toBe(false);

		const playback = greybox?.criteria.find((criterion) => criterion.id === "greybox:probe-input");
		const tick = greybox?.criteria.find((criterion) => criterion.id === "greybox:probe-advance");
		expect(playback?.verifier).toEqual({
			kind: "assertion",
			source: "recording-telemetry",
			expression: GREYBOX_PLAYBACK_EXPRESSION,
		});
		expect(tick?.verifier).toEqual({
			kind: "assertion",
			source: "recording-telemetry",
			expression: GREYBOX_TICK_EXPRESSION,
		});
		expect(greybox?.criteria.some((criterion) => criterion.verifier && "kind" in criterion.verifier && criterion.verifier.kind === "telemetry")).toBe(false);
		expect(greybox?.criteria.find((criterion) => criterion.id === "greybox:node:player")?.verifier).toBeUndefined();
		expect(delivery?.criteria.some((criterion) => criterion.verifier?.kind === "command")).toBe(true);
	});
});
