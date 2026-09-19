import type { AgentProfile, AgentProfileDocument } from "./contracts.js";
import { AGENT_PROFILE_SCHEMA_VERSION } from "./contracts.js";

/**
 * 一份「四个智能体」的完整 Agent 配置，仅供测试与开发夹具使用。
 *
 * 产品里的预设智能体全部由扩展提供、由扩展回填（见 desktop 的 plugin-agent-preset-sync），
 * 宿主不带装机资源。这里的 blueprintId 刻意保持历史短 id：它同时是「提供方声明历史 id 后
 * 老档案还能被认领」这条路径的样本。
 */
const INITIAL_PROFILE_DEFINITIONS = [
	{
		id: "3c9b7d14-62a8-4f05-8e73-2d4a1b6c9e07",
		key: "master",
		name: "Master",
		description: "Owns the goal end to end: plans the workflow, delegates each step, accepts or reworks results.",
		handle: "master",
		blueprintId: "master",
	},
	{
		id: "5e2a8f36-91c4-4d70-b18a-6f3c0d92a5b8",
		key: "developer",
		name: "Developer",
		description: "Produces the core asset: code, a substantive draft, or a worked analysis.",
		handle: "developer",
		// 历史短 id：这一份正是「executor 改名 developer 后仍要被认领」的样本。
		blueprintId: "executor",
	},
	{
		id: "6d0f4b81-3c27-4e95-a760-2b8d14f9c063",
		key: "auditor",
		name: "Auditor",
		description: "Red-teams the work for correctness, safety, edge cases, and unsupported claims.",
		handle: "auditor",
		blueprintId: "auditor",
	},
	{
		id: "9b4c1e58-7a02-4836-95df-8c1e6a30b742",
		key: "researcher",
		name: "Researcher",
		description: "Collects facts, documentation, prior art, and market signals, and verifies them.",
		handle: "researcher",
		blueprintId: "researcher",
	},
] as const;

export const INITIAL_AGENT_PROFILES: readonly AgentProfile[] = Object.freeze(
	INITIAL_PROFILE_DEFINITIONS.map((profile) =>
		Object.freeze({
			id: profile.id,
			revision: 1,
			name: profile.name,
			description: profile.description,
			mentionHandle: profile.handle,
			blueprintId: profile.blueprintId,
			abilities: Object.freeze({
				selectionMode: "all" as const,
				skills: Object.freeze([]),
				mcpServers: Object.freeze([]),
				plugins: Object.freeze([]),
			}),
			scope: Object.freeze({ kind: "library" as const }),
			createdAt: 0,
			updatedAt: 0,
		}),
	),
);

/** 测试夹具：产品运行时不读它。 */
export function createAgentProfileFixture(): AgentProfileDocument {
	return {
		schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
		revision: 1,
		agents: INITIAL_AGENT_PROFILES.map(cloneProfile),
	};
}

function cloneProfile(profile: AgentProfile): AgentProfile {
	return {
		...profile,
		abilities: {
			...profile.abilities,
			skills: [...profile.abilities.skills],
			mcpServers: [...profile.abilities.mcpServers],
			plugins: [...profile.abilities.plugins],
		},
		scope: { kind: "library" },
	};
}
