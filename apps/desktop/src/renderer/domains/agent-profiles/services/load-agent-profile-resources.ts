import type { AgentBlueprint, AgentProfileDocument } from "@origin/agent-profile";
import { i18n } from "@shared/i18n";
import type { BlueprintDisplayPlugin } from "../lib/blueprint-display";
import { type AgentCapabilityOption, buildAgentCapabilityOptions } from "../lib/capability-options";

export interface AgentProfileConfigurationResources {
	readonly document: AgentProfileDocument;
	readonly blueprints: readonly AgentBlueprint[];
	readonly capabilities: readonly AgentCapabilityOption[];
	/** 解析插件贡献的角色名，以及说明档案为什么暂时不可用。 */
	readonly plugins: readonly BlueprintDisplayPlugin[];
}

export async function loadAgentProfileConfigurationResources(): Promise<AgentProfileConfigurationResources> {
	const [document, blueprints, skills, skillManifest, mcpConfig, plugins] = await Promise.all([
		window.originApp.agentProfiles.list(),
		window.originApp.agentProfiles.listBlueprints(),
		window.originApp.skills.list(),
		window.originApp.skills.getMarketManifest(),
		window.originApp.mcp.get(),
		window.originApp.plugins.listAll(),
	]);
	return {
		document,
		blueprints,
		plugins: plugins as readonly BlueprintDisplayPlugin[],
		capabilities: buildAgentCapabilityOptions({
			skills,
			skillManifest,
			mcpConfig,
			plugins,
			locale: i18n.language,
		}),
	};
}
