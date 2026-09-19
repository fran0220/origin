import type { PluginEvaluationVerifier } from "@origin-org/plugin-sdk";
import type { DesignGraph, ProductionMilestone } from "../design/types";

export const GREYBOX_PLAYBACK_EXPRESSION =
	'{"all":[{"path":"playback.refused","op":"eq","value":0},{"path":"playback.dispatched","op":"gt","value":0}]}';
export const GREYBOX_TICK_EXPRESSION = '{"path":"afterTick","op":"gt","other":"beforeTick"}';

export interface EvaluationCriterion {
	id: string;
	title: string;
	required: boolean;
	verifier?: PluginEvaluationVerifier;
}

export interface EvaluationDefinition {
	id: string;
	revision: number;
	title: string;
	criteria: EvaluationCriterion[];
}

export const SCAFFOLD_VERIFICATION_COMMANDS: Record<
	"canvas2d" | "three",
	readonly { command: string; args: readonly string[] }[]
> = {
	canvas2d: [
		{ command: "bun", args: ["run", "typecheck"] },
		{ command: "bun", args: ["run", "build"] },
		{ command: "bun", args: ["run", "check:arch"] },
		{ command: "bun", args: ["run", "check:smoke"] },
	],
	three: [
		{ command: "bun", args: ["run", "typecheck"] },
		{ command: "bun", args: ["run", "build"] },
		{ command: "bun", args: ["run", "check:arch"] },
		{ command: "bun", args: ["run", "check:smoke"] },
		{ command: "bun", args: ["run", "check:wgsl"] },
	],
};

export function milestoneDefinitionId(milestoneId: string): string {
	return `game-milestone:${milestoneId}`;
}

function commandVerifier(command: string, args: readonly string[], cwd: string): PluginEvaluationVerifier {
	return { kind: "command", command, args: [...args], cwd };
}

function telemetryVerifier(expression: string): PluginEvaluationVerifier {
	return { kind: "assertion", source: "recording-telemetry", expression };
}

export function definitionFromMilestone(
	milestone: ProductionMilestone,
	graph: DesignGraph,
	index: number,
	cwd: string,
): EvaluationDefinition {
	const substrate = graph.substrate ?? "canvas2d";
	const commands = SCAFFOLD_VERIFICATION_COMMANDS[substrate];
	const criteria: EvaluationCriterion[] = commands.map((item, commandIndex) => ({
		id: `${milestone.id}:build:${commandIndex}`,
		title: `${item.command} ${item.args.join(" ")}`,
		required: true,
		verifier: commandVerifier(item.command, item.args, cwd),
	}));
	if (milestone.kind === "greybox") {
		criteria.push({
			id: `${milestone.id}:probe-input`,
			title: "Probe-accepted player input without refusals",
			required: true,
			verifier: telemetryVerifier(GREYBOX_PLAYBACK_EXPRESSION),
		});
		criteria.push({
			id: `${milestone.id}:probe-advance`,
			title: "Observed advancing probe frames",
			required: true,
			verifier: telemetryVerifier(GREYBOX_TICK_EXPRESSION),
		});
	}
	if (milestone.kind === "delivery") {
		criteria.push({
			id: `${milestone.id}:archive`,
			title: "Prepared immutable production archive",
			required: true,
			verifier: commandVerifier("bun", ["run", "build"], cwd),
		});
	}
	for (const nodeId of milestone.nodeIds) {
		criteria.push({
			id: `${milestone.id}:node:${nodeId}`,
			title: `Active node ${nodeId} is specified`,
			required: false,
		});
	}
	return {
		id: milestoneDefinitionId(milestone.id),
		revision: 1,
		title: `${index + 1}. ${milestone.title}`,
		criteria,
	};
}

export function definitionsFromGraph(graph: DesignGraph, cwd: string): EvaluationDefinition[] {
	return graph.milestones.map((milestone, index) => definitionFromMilestone(milestone, graph, index, cwd));
}
