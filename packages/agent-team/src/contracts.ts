export const AGENT_PROFILE_SCHEMA_VERSION = 1 as const;

export type AgentAbilityKind = "skill" | "scene" | "mcp" | "plugin" | (string & {});

export interface AgentAbilitySelection {
	/**
	 * `all` inherits every globally enabled capability, including capabilities installed later.
	 * `custom` uses the listed skills, MCP servers, and plugins only.
	 */
	readonly selectionMode: "all" | "custom";
	readonly skills: readonly string[];
	readonly mcpServers: readonly string[];
	readonly plugins: readonly string[];
	/** Extension-owned capability selections. Keys are extension IDs; values are resource IDs. */
	readonly extensions?: Readonly<Record<string, readonly string[]>>;
}

export type AgentProfileScope = { readonly kind: "library" };

export interface AgentProfile {
	readonly id: string;
	readonly revision: number;
	readonly name: string;
	readonly description: string;
	readonly avatar?: string;
	readonly mentionHandle: string;
	readonly blueprintId: string;
	/** Optional file-backed override; absent means use the registered blueprint default. */
	readonly systemPrompt?: string;
	readonly abilities: AgentAbilitySelection;
	readonly scope: AgentProfileScope;
	readonly copiedFrom?: string;
	/** 提供方；缺省即用户自建。扩展提供的档案由提供方维护，宿主不允许删除。 */
	readonly source?: AgentResourceSource;
	readonly createdAt: number;
	readonly updatedAt: number;
}

export interface AgentProfileDocument {
	readonly schemaVersion: typeof AGENT_PROFILE_SCHEMA_VERSION;
	readonly revision: number;
	readonly agents: readonly AgentProfile[];
}

export interface CreateAgentProfileInput {
	readonly name: string;
	readonly description?: string;
	readonly avatar?: string;
	readonly mentionHandle: string;
	readonly blueprintId: string;
	readonly abilities?: Partial<AgentAbilitySelection>;
}

export interface UpdateAgentProfileInput {
	readonly expectedRevision: number;
	readonly name: string;
	readonly description: string;
	readonly avatar?: string;
	readonly mentionHandle: string;
	readonly systemPrompt?: string;
	readonly abilities: AgentAbilitySelection;
}

export interface DeleteAgentProfileInput {
	readonly expectedRevision: number;
}

/**
 * 智能体资源的提供方。
 *
 * `plugin` 表示这份资源由插件贡献：人设、头像都由插件维护，宿主只负责铺档案
 * 与展示来源，不得删除。
 */
export interface AgentResourceSource {
	readonly kind: "plugin";
	readonly pluginId: string;
	/**
	 * 名称在提供方语言包里的 key（不带 `%`）。`name` 只存默认语言的字面量，是给模型与降级
	 * 展示用的；界面按这个 key 现场查提供方的语言包，切换语言才能立刻跟上（ADR-0033）。
	 */
	readonly nameKey?: string;
	/** 描述的语言包 key，语义同 {@link AgentResourceSource.nameKey}。 */
	readonly descriptionKey?: string;
}

export interface AgentBlueprint {
	readonly id: string;
	/** i18n key；插件 blueprint 走 {@link AgentBlueprint.name} 的字面量，二者取其一。 */
	readonly nameKey: string;
	readonly descriptionKey: string;
	/** 插件 blueprint 的字面名称（已按插件 locales 解析）。存在时优先于 `nameKey`。 */
	readonly name?: string;
	readonly description?: string;
	readonly systemPrompt: string;
	readonly defaultAbilities: AgentAbilitySelection;
	/** 缺省视为内置。 */
	readonly source?: AgentResourceSource;
	/** 头像 URL；插件 blueprint 由宿主解析成插件资源地址。 */
	readonly avatarUrl?: string;
	/**
	 * 强制随该智能体激活的插件能力，用户在能力面板里关不掉。
	 *
	 * 插件智能体的存在意义就是操作它自己的插件：全局把插件能力关掉更可能是「不想在普通
	 * 对话里看到」，而不是「选了这个智能体也不许用」。运行时按并集解析，不写进用户档案。
	 */
	readonly pinnedPlugins?: readonly string[];
}

export const EMPTY_AGENT_ABILITIES: AgentAbilitySelection = Object.freeze({
	selectionMode: "custom",
	skills: Object.freeze([]),
	mcpServers: Object.freeze([]),
	plugins: Object.freeze([]),
});
