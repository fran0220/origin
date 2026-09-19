import type { DesignGraph, ProductionMilestone } from "../design/types";

export interface EvaluationVerifierRef {
	kind: "command" | "telemetry";
	command?: string;
	cwd?: string;
	assertion?: string;
}

export interface EvaluationCriterion {
	id: string;
	title: string;
	required: boolean;
	verifier?: EvaluationVerifierRef;
}

export interface EvaluationDefinition {
	id: string;
	revision: number;
	title: string;
	criteria: EvaluationCriterion[];
}

export const SCAFFOLD_VERIFICATION_COMMANDS: Record<"canvas2d" | "three", readonly string[]> = {
	canvas2d: ["bun run typecheck", "bun run build", "bun run check:arch", "bun run check:smoke"],
	three: [
		"bun run typecheck",
		"bun run build",
		"bun run check:arch",
		"bun run check:smoke",
		"bun run check:wgsl",
	],
};

export function milestoneDefinitionId(milestoneId: string): string {
	return `game-milestone:${milestoneId}`;
}

export function definitionFromMilestone(
	milestone: ProductionMilestone,
	graph: DesignGraph,
	index: number,
): EvaluationDefinition {
	const substrate = graph.substrate ?? "canvas2d";
	const commands = SCAFFOLD_VERIFICATION_COMMANDS[substrate];
	const criteria: EvaluationCriterion[] = commands.map((command, commandIndex) => ({
		id: `${milestone.id}:build:${commandIndex}`,
		title: command,
		required: true,
		verifier: { kind: "command", command },
	}));
	if (milestone.kind === "greybox") {
		criteria.push({
			id: `${milestone.id}:probe-input`,
			title: "Probe-accepted player input without refusals",
			required: true,
			verifier: { kind: "telemetry", assertion: "playback.refused === 0 && playback.dispatched > 0" },
		});
		criteria.push({
			id: `${milestone.id}:probe-advance`,
			title: "Observed advancing probe frames",
			required: true,
			verifier: { kind: "telemetry", assertion: "afterTick > beforeTick" },
		});
	}
	if (milestone.kind === "delivery") {
		criteria.push({
			id: `${milestone.id}:archive`,
			title: "Prepared immutable production archive",
			required: true,
			verifier: { kind: "command", command: "bun run build" },
		});
	}
	for (const nodeId of milestone.nodeIds) {
		criteria.push({
			id: `${milestone.id}:node:${nodeId}`,
			title: `Active node ${nodeId} is specified`,
			required: false,
			verifier: { kind: "telemetry", assertion: `graph.node.${nodeId}.active` },
		});
	}
	return {
		id: milestoneDefinitionId(milestone.id),
		revision: 1,
		title: `${index + 1}. ${milestone.title}`,
		criteria,
	};
}

export function definitionsFromGraph(graph: DesignGraph): EvaluationDefinition[] {
	return graph.milestones.map((milestone, index) => definitionFromMilestone(milestone, graph, index));
}
