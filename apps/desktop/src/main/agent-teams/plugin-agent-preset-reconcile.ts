import { createHash } from "node:crypto";
import type { AgentProfile, AgentProfileDocument } from "@origin/agent-team";
import { normalizeMentionHandle } from "@origin/agent-team";
import type { PluginAgentPreset } from "./plugin-agent-presets.js";

/**
 * 已安装插件（**含禁用**）声明过的预设标识。
 *
 * 清理的判据只能是「还有没有插件声明它」，不能是「当前解析得出来吗」：插件被禁用时它的
 * 预设整体不解析，照后者会把用户只是临时关掉的插件资产一次清光。
 */
export interface PluginPresetDeclarations {
	/** 智能体的 blueprint id，含提供方声明的历史 id。 */
	readonly agentBlueprintIds: ReadonlySet<string>;
}

export interface PluginPresetReconcileInput {
	readonly document: AgentProfileDocument;
	/** 当前已启用插件贡献的智能体。 */
	readonly agents: readonly PluginAgentPreset[];
	/** 缺省视为「只有上面这些预设被声明过」，其余插件资产一律判为残骸。 */
	readonly declarations?: PluginPresetDeclarations;
	readonly now?: () => number;
}

export interface PluginPresetReconcileResult {
	readonly document: AgentProfileDocument;
	readonly installedAgentIds: readonly string[];
	readonly removedAgentIds: readonly string[];
}

/**
 * 把用户配置里属于插件的那一部分，对齐成插件清单此刻的样子。
 *
 * 插件贡献的智能体由提供方 1:1 维护：用户改不动、删不掉，插件升级就用新的整体覆盖旧的
 * ——名字、说明全部以清单为准。这是**声明式**的：清单里没有的插件资产会被清掉。
 *
 * 只有 {@link PluginPresetDeclarations} 里再没人声明的才算残骸。插件只是被禁用时，它的资产
 * 原样留在列表里降级展示——用户重新启用，一切照旧，中间不动它们。
 *
 * 返回 undefined 表示配置已经与清单一致，调用方不必写盘。
 */
export function reconcilePluginAgentPresets(
	input: PluginPresetReconcileInput,
): PluginPresetReconcileResult | undefined {
	const now = input.now?.() ?? Date.now();
	const declarations = input.declarations ?? declarationsOf(input.agents);
	const dropped = dropUndeclaredPluginResources(input.document, declarations);
	const applied = applyPluginPresets(dropped.document, input.agents, now);

	if (!applied && dropped.removedAgentIds.length === 0) return undefined;
	const document = applied?.document ?? dropped.document;
	return {
		document: { ...document, revision: input.document.revision + 1 },
		installedAgentIds: applied?.installedAgentIds ?? [],
		removedAgentIds: dropped.removedAgentIds,
	};
}

/** 没有单独给出声明集合时，按「当前这批预设就是全部声明」推导。 */
function declarationsOf(agents: readonly PluginAgentPreset[]): PluginPresetDeclarations {
	return {
		agentBlueprintIds: new Set(agents.flatMap((preset) => [preset.blueprint.id, ...preset.legacyBlueprintIds])),
	};
}

interface DropResult {
	readonly document: AgentProfileDocument;
	readonly removedAgentIds: readonly string[];
}

/**
 * 清掉再没有插件声明的插件档案。
 *
 * 只清库里的档案（`scope: library`）。
 */
function dropUndeclaredPluginResources(
	document: AgentProfileDocument,
	declarations: PluginPresetDeclarations,
): DropResult {
	const removedAgentIds = new Set(
		document.agents
			.filter(
				(agent) =>
					agent.source !== undefined &&
					agent.scope.kind === "library" &&
					!declarations.agentBlueprintIds.has(agent.blueprintId),
			)
			.map((agent) => agent.id),
	);
	if (removedAgentIds.size === 0) {
		return { document, removedAgentIds: [] };
	}

	return {
		document: {
			...document,
			agents: document.agents.filter((agent) => !removedAgentIds.has(agent.id)),
		},
		removedAgentIds: [...removedAgentIds],
	};
}

interface ApplyResult {
	readonly document: AgentProfileDocument;
	readonly installedAgentIds: readonly string[];
}

function applyPluginPresets(
	document: AgentProfileDocument,
	agentPresets: readonly PluginAgentPreset[],
	now: number,
): ApplyResult | undefined {
	const agents = [...document.agents];
	const installedAgentIds: string[] = [];
	let changed = false;

	// @handle 要在整个智能体库里唯一。先占掉不由插件维护的那些，插件档案再按清单里的短名让号。
	const handles = new Set(
		agents
			.filter((agent) => agent.scope.kind === "library" && !isPresetOwned(agent, agentPresets))
			.map((agent) => normalizeMentionHandle(agent.mentionHandle)),
	);

	for (const preset of agentPresets) {
		const index = findPresetAgent(agents, preset);
		const current = index >= 0 ? agents[index]! : undefined;
		const next = presetAgentProfile(preset, current, handles, now);
		if (!current) {
			agents.push(next);
			installedAgentIds.push(next.id);
			changed = true;
			continue;
		}
		if (sameAgent(current, next)) continue;
		agents[index] = next;
		changed = true;
	}

	if (!changed) return undefined;
	return { document: { ...document, agents }, installedAgentIds };
}

function isPresetOwned(agent: AgentProfile, presets: readonly PluginAgentPreset[]): boolean {
	return presets.some((preset) => matchesAgentPreset(agent, preset));
}

function matchesAgentPreset(agent: AgentProfile, preset: PluginAgentPreset): boolean {
	if (agent.scope.kind !== "library") return false;
	if (agent.id === pluginAgentProfileId(preset.pluginId, preset.agentId)) return true;
	return agent.blueprintId === preset.blueprint.id || preset.legacyBlueprintIds.includes(agent.blueprintId);
}

/**
 * 找到这份预设对应的既有档案：规范 id 优先，其次按 blueprint（含历史 id）认领。
 *
 * 认领而不是新铺一份，是为了保住档案 id：用户自建的会话里的引用都挂在它上面，换 id
 * 等于把这些引用全部作废。
 */
function findPresetAgent(agents: readonly AgentProfile[], preset: PluginAgentPreset): number {
	return agents.findIndex((agent) => matchesAgentPreset(agent, preset));
}

/**
 * 按清单造出这份档案此刻应有的样子。
 *
 * 除 id 外一切以清单为准：名字、说明、能力都不保留用户的改动——这些档案由提供方 1:1 维护，
 * 保留一半的用户改动只会让「同一个插件在两台机器上长得不一样」。
 *
 * 两处刻意留空：`avatar` 与 `systemPrompt`。它们的真值在 blueprint 上，落进档案等于把某一版
 * 的图和提示词钉死在存量用户那里。
 */
function presetAgentProfile(
	preset: PluginAgentPreset,
	current: AgentProfile | undefined,
	handles: Set<string>,
	now: number,
): AgentProfile {
	const id = current?.id ?? pluginAgentProfileId(preset.pluginId, preset.agentId);
	return {
		id,
		revision: current ? current.revision + 1 : 1,
		name: preset.profileName,
		description: preset.profileDescription,
		mentionHandle: allocateHandle(preset.mentionHandle, handles),
		blueprintId: preset.blueprint.id,
		abilities: {
			selectionMode: preset.blueprint.defaultAbilities.selectionMode ?? "all",
			skills: [...preset.blueprint.defaultAbilities.skills],
			mcpServers: [...preset.blueprint.defaultAbilities.mcpServers],
			plugins: [...preset.blueprint.defaultAbilities.plugins],
		},
		scope: { kind: "library" },
		source: { kind: "plugin", pluginId: preset.pluginId, ...preset.profileTextKeys },
		createdAt: current?.createdAt ?? now,
		updatedAt: now,
	};
}

/** 只比内容，不比 `revision` / `updatedAt`：同步是幂等的，没改出东西就不该让版本号往前走。 */
function sameAgent(current: AgentProfile, next: AgentProfile): boolean {
	const { revision: _r, updatedAt: _u, ...left } = current;
	const { revision: _nr, updatedAt: _nu, ...right } = next;
	return stableStringify(left) === stableStringify(right);
}

/** 键序无关的序列化：两份内容相同、写入顺序不同的对象必须比成相等。 */
function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, item]) => item !== undefined)
			.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
		return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

function allocateHandle(preferred: string, taken: Set<string>): string {
	const base = normalizeMentionHandle(preferred) || "agent";
	if (!taken.has(base)) {
		taken.add(base);
		return base;
	}
	for (let suffix = 2; suffix < 100; suffix += 1) {
		const candidate = `${base}-${suffix}`;
		if (!taken.has(candidate)) {
			taken.add(candidate);
			return candidate;
		}
	}
	const fallback = `${base}-${Math.random().toString(36).slice(2, 8)}`;
	taken.add(fallback);
	return fallback;
}

export function pluginAgentProfileId(pluginId: string, agentId: string): string {
	return deterministicId("agent-profile", `${pluginId}:${agentId}`);
}

/**
 * 由插件与预设 id 推导出稳定的资源 id。
 *
 * 必须是确定性的：插件卸载重装、换版本，铺出来的都得是同一份档案，否则用户会收到一堆
 * 重复的智能体。形状取 UUID 是为了和用户自建的资源长得一样——布局 v2 之后，装机资源
 * 与用户数据本就不该能一眼区分。
 */
function deterministicId(namespace: string, value: string): string {
	const digest = createHash("sha256").update(`vetta:plugin-preset:${namespace}:${value}`, "utf8").digest("hex");
	return [
		digest.slice(0, 8),
		digest.slice(8, 12),
		digest.slice(12, 16),
		digest.slice(16, 20),
		digest.slice(20, 32),
	].join("-");
}
