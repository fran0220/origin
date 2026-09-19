import type { AgentProfile } from "@origin/agent-profile";
import { useCallback } from "react";
import type { AgentCapabilityOption } from "../lib/capability-options";
import { type AgentLibraryCopy, type AgentProfileEditInput, useAgentLibraryModel } from "./useAgentLibraryModel";
import { agentProfileErrorMessage, useAgentProfileResources } from "./useAgentProfileResources";

/** 侧栏「智能体」入口页只承载智能体库。 */
export function useAgentCenterModel(copy: AgentLibraryCopy) {
	const resources = useAgentProfileResources();
	const library = useAgentLibraryModel(resources, copy);
	const { createAgent } = library.actions;

	const createAgentFromDraft = useCallback(
		async (input: AgentProfileEditInput): Promise<AgentProfile | undefined> => {
			const created = await createAgent();
			if (!created) return undefined;
			try {
				const updated = await window.originApp.agentProfiles.updateAgent(created.id, {
					expectedRevision: created.revision,
					name: input.name.trim() || created.name,
					description: input.description,
					avatar: input.avatar,
					mentionHandle: created.mentionHandle,
					systemPrompt: input.systemPrompt,
					abilities: input.abilities,
				});
				resources.setDocument((current) =>
					current
						? { ...current, agents: current.agents.map((item) => (item.id === updated.id ? updated : item)) }
						: current,
				);
				return updated;
			} catch (cause) {
				resources.setError(agentProfileErrorMessage(cause));
				return undefined;
			}
		},
		[createAgent, resources],
	);

	return {
		loading: resources.loading,
		error: resources.error,
		document: resources.document,
		blueprints: resources.blueprints,
		plugins: resources.plugins,
		capabilities: resources.capabilities as readonly AgentCapabilityOption[],
		agents: library.libraryAgents,
		findAgent: (agentId: string) => library.libraryAgents.find((agent) => agent.id === agentId),
		actions: {
			...library.actions,
			createAgentFromDraft,
		},
	};
}

export type AgentCenterModel = ReturnType<typeof useAgentCenterModel>;
