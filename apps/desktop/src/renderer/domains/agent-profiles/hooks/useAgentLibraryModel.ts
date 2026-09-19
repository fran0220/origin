import { type AgentAbilitySelection, type AgentProfile, listLibraryAgentProfiles } from "@origin/agent-profile";
import { useCallback, useMemo } from "react";
import { type AgentProfileResources, agentProfileErrorMessage } from "./useAgentProfileResources";

export interface AgentLibraryCopy {
	readonly defaultName: string;
	readonly defaultDescription: string;
}

/** 智能体库的增删改查。 */
export function useAgentLibraryModel(resources: AgentProfileResources, copy: AgentLibraryCopy) {
	const { document, setDocument, blueprints, setError } = resources;

	const libraryAgents = useMemo(() => (document ? listLibraryAgentProfiles(document) : []), [document]);

	const createAgent = useCallback(async (): Promise<AgentProfile | undefined> => {
		const nextBlueprint = blueprints[0];
		if (!nextBlueprint) return undefined;
		try {
			const created = await window.originApp.agentProfiles.createAgent({
				name: copy.defaultName,
				description: copy.defaultDescription,
				mentionHandle: `agent-${libraryAgents.length + 1}`,
				blueprintId: nextBlueprint.id,
			});
			setDocument((current) => (current ? { ...current, agents: [...current.agents, created] } : current));
			setError(undefined);
			return created;
		} catch (cause) {
			setError(agentProfileErrorMessage(cause));
			return undefined;
		}
	}, [blueprints, copy.defaultDescription, copy.defaultName, libraryAgents.length, setDocument, setError]);

	const saveAgent = useCallback(
		async (agent: AgentProfile, input: AgentProfileEditInput) => {
			const updated = await window.originApp.agentProfiles.updateAgent(agent.id, {
				expectedRevision: agent.revision,
				name: input.name,
				description: input.description,
				avatar: input.avatar,
				mentionHandle: input.mentionHandle,
				systemPrompt: input.systemPrompt,
				abilities: input.abilities,
			});
			setDocument((current) =>
				current
					? { ...current, agents: current.agents.map((item) => (item.id === updated.id ? updated : item)) }
					: current,
			);
			return { updated };
		},
		[setDocument],
	);

	const deleteAgent = useCallback(
		async (agent: AgentProfile): Promise<boolean> => {
			try {
				await window.originApp.agentProfiles.deleteAgent(agent.id, { expectedRevision: agent.revision });
				setDocument(await window.originApp.agentProfiles.list());
				setError(undefined);
				return true;
			} catch (cause) {
				setError(agentProfileErrorMessage(cause));
				return false;
			}
		},
		[setDocument, setError],
	);

	return {
		libraryAgents,
		actions: { createAgent, saveAgent, deleteAgent },
	};
}

export interface AgentProfileEditInput {
	readonly name: string;
	readonly description: string;
	readonly avatar?: string;
	readonly mentionHandle: string;
	readonly systemPrompt?: string;
	readonly abilities: AgentAbilitySelection;
}
