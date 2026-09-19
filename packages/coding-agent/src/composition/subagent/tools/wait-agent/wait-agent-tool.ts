import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import type { SubagentCoordinatorPort } from "@vetta/runtime-subagents";
import { ToolCallDescriptionSchema } from "@vetta/runtime-tools/coding";
import { WAIT_AGENT_TOOL_DESCRIPTION } from "./description.js";

export const WaitAgentToolInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	targets: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"Child ids, task_names, or /root/<task_name> paths. Omit to wait on any undelivered/active child.",
		}),
	),
	timeout_ms: Type.Optional(
		Type.Number({
			description: "Wait timeout in ms (default 30000, clamp 1000..300000)",
		}),
	),
});

export type WaitAgentToolInput = Static<typeof WaitAgentToolInputSchema>;

export interface WaitAgentToolOptions {
	readonly getCoordinator: () => SubagentCoordinatorPort | undefined;
}

export function createWaitAgentTool(options: WaitAgentToolOptions): RuntimeToolDefinition<WaitAgentToolInput> {
	return {
		name: "wait_agent",
		label: "wait_agent",
		description: WAIT_AGENT_TOOL_DESCRIPTION,
		inputSchema: WaitAgentToolInputSchema,
		async execute({ input }) {
			const coordinator = requireCoordinator(options);
			const result = await coordinator.wait({
				targets: input.targets,
				timeoutMs: input.timeout_ms,
			});
			if (result.agents.length === 0) {
				const text = result.timedOut
					? "wait_agent timed out with no terminal subagent results."
					: "No matching subagents to wait on.";
				return {
					content: [{ type: "text", text }],
					details: { timedOut: result.timedOut, agents: [] },
				};
			}
			const lines = result.agents.map((snapshot) => {
				const parts = [
					`id=${snapshot.id}`,
					`path=${snapshot.path}`,
					`type=${snapshot.agentType}`,
					`status=${snapshot.status}`,
				];
				if (snapshot.errorMessage) parts.push(`error=${snapshot.errorMessage}`);
				if (snapshot.finalText) parts.push(`\nsummary:\n${snapshot.finalText}`);
				return parts.join(" ");
			});
			const text = [
				result.timedOut ? "wait_agent finished (timeout with partial results):" : "wait_agent results:",
				...lines,
			].join("\n\n");
			return {
				content: [{ type: "text", text }],
				details: { timedOut: result.timedOut, agents: result.agents },
			};
		},
	};
}

function requireCoordinator(options: WaitAgentToolOptions): SubagentCoordinatorPort {
	const coordinator = options.getCoordinator();
	if (!coordinator) throw new Error("Subagents are not enabled for this session.");
	return coordinator;
}
