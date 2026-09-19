import {
	AGENT_PROFILE_SCHEMA_VERSION,
	type AgentProfile,
	type AgentProfileDocument,
	type CreateAgentProfileInput,
	type DeleteAgentProfileInput,
	normalizeMentionHandle,
	parseAgentProfileDocument,
	type UpdateAgentProfileInput,
} from "@origin/agent-profile";
import { getAppLogger } from "../logger.js";
import { agentBlueprintRegistry, resolveAgentBlueprint } from "./agent-blueprint-registry.js";
import {
	type AgentProfileConfigRepository,
	createAgentProfileConfigRepository,
} from "./agent-profile-config-repository.js";
import { reconcilePluginAgentPresets } from "./plugin-agent-preset-reconcile.js";

const log = getAppLogger("agent-profiles");

/**
 * 提供方维护的智能体被要求改写或删除时的错误。
 *
 * 这些资源由提供方 1:1 维护：插件升级会整体覆盖它们，任何就地改动都活不过下一次同步，所以
 * 写入直接拒掉而不是先接受再被盖掉。用一个稳定的标识而不是人读文案：渲染进程要据此给出可读
 * 提示，而这条路径正常情况下走不到——UI 根本不该给出编辑入口。
 */
export const PROVIDED_RESOURCE_WRITE_ERROR = "AGENT_RESOURCE_PROVIDED_BY_EXTENSION";

export interface AgentProfileStoreOptions {
	readonly repository?: AgentProfileConfigRepository;
	readonly createId?: () => string;
	readonly now?: () => number;
}

export class AgentProfileStore {
	private document: AgentProfileDocument | undefined;
	private loadPromise: Promise<AgentProfileDocument> | undefined;
	private mutationTail: Promise<void> = Promise.resolve();
	private readonly repository: AgentProfileConfigRepository;
	private readonly createId: () => string;
	private readonly now: () => number;
	private readonly presetListeners = new Set<(document: AgentProfileDocument) => void>();

	constructor(options: AgentProfileStoreOptions = {}) {
		this.repository = options.repository ?? createAgentProfileConfigRepository();
		this.createId = options.createId ?? (() => crypto.randomUUID());
		this.now = options.now ?? Date.now;
	}

	async read(): Promise<AgentProfileDocument> {
		if (this.document) return this.document;
		this.loadPromise ??= this.repository
			.read()
			.then((document) => {
				this.document = document;
				return document;
			})
			.catch((error: unknown) => {
				log.error("failed to read agent profile configuration", { error: errorMessage(error) });
				throw new Error("Agent Profile configuration could not be loaded", { cause: error });
			})
			.finally(() => {
				this.loadPromise = undefined;
			});
		return this.loadPromise;
	}

	async listBlueprints() {
		return agentBlueprintRegistry.list();
	}

	/**
	 * 订阅「插件预设被重铺」。变更由插件装卸/热重载触发，不是用户的编辑。
	 *
	 * 用户自己的改动不从这里发：那是渲染进程自己发起的写入，它手上已经有结果，再推一次只会把
	 * 正在编辑的表单顶掉。
	 */
	onPluginPresetsApplied(listener: (document: AgentProfileDocument) => void): () => void {
		this.presetListeners.add(listener);
		return () => this.presetListeners.delete(listener);
	}

	/**
	 * 按插件清单此刻的样子重铺配置里属于插件的那一部分。
	 *
	 * 插件装卸、启停与开发态热重载都要走这一趟：注册表刷新只改了主进程的解析表，用户看到的智能体
	 * 来自已经读进内存的配置文档，不重铺就会一直停在旧阵容直到重启 App。
	 *
	 * 返回是否真的改出了东西，调用方据此决定要不要通知渲染进程。
	 */
	async syncPluginPresets(): Promise<boolean> {
		return this.enqueue(async () => {
			const current = await this.read();
			const reconciled = reconcilePluginAgentPresets({
				document: current,
				agents: agentBlueprintRegistry.listPluginAgents(),
				declarations: agentBlueprintRegistry.listPluginPresetDeclarations(),
			});
			if (!reconciled) return false;
			const document = await this.persist("sync-plugin-presets", reconciled.document);
			log.info("plugin agent presets applied", {
				installedAgents: reconciled.installedAgentIds.length,
				removedAgents: reconciled.removedAgentIds.length,
			});
			for (const listener of [...this.presetListeners]) {
				try {
					listener(document);
				} catch (error) {
					// 一个订阅者出错不该拦住其余订阅者。
					log.warn("agent profile preset listener failed", { error: errorMessage(error) });
				}
			}
			return true;
		});
	}

	async createAgent(input: CreateAgentProfileInput): Promise<AgentProfile> {
		const profile = await this.mutate("create-agent", (document) => {
			const now = this.now();
			const blueprint = resolveAgentBlueprint(input.blueprintId);
			if (!blueprint) throw new Error(`Unknown agent blueprint: ${input.blueprintId}`);
			const created: AgentProfile = {
				id: this.createId(),
				revision: 1,
				name: input.name.trim(),
				description: input.description?.trim() ?? "",
				...(input.avatar ? { avatar: input.avatar } : {}),
				mentionHandle: normalizeMentionHandle(input.mentionHandle),
				blueprintId: input.blueprintId,
				abilities: createAgentAbilities(input.abilities, blueprint.defaultAbilities),
				scope: { kind: "library" },
				createdAt: now,
				updatedAt: now,
			};
			this.ensureUniqueHandle(document, created.mentionHandle, undefined);
			return {
				document: { ...document, revision: document.revision + 1, agents: [...document.agents, created] },
				result: created,
			};
		});
		log.info("agent profile created", { agentProfileId: profile.id, blueprintId: profile.blueprintId });
		return profile;
	}

	async updateAgent(agentProfileId: string, input: UpdateAgentProfileInput): Promise<AgentProfile> {
		const result = await this.mutate("update-agent", (document) => {
			const index = document.agents.findIndex((agent) => agent.id === agentProfileId);
			if (index < 0) throw new Error(`Agent profile not found: ${agentProfileId}`);
			const current = document.agents[index];
			// 提供方维护的档案不接受编辑：下一次插件同步会用清单重铺它，改动留不下来。
			if (current.source) throw new Error(PROVIDED_RESOURCE_WRITE_ERROR);
			if (current.revision !== input.expectedRevision)
				throw new Error("Agent profile changed; reload before saving");
			this.ensureUniqueHandle(document, normalizeMentionHandle(input.mentionHandle), agentProfileId);
			const next: AgentProfile = {
				...current,
				name: input.name.trim(),
				description: input.description.trim(),
				// 留空即清除覆盖，回到 blueprint 默认；写成空串会让下游的 `?? blueprint` 兜底失效。
				...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt.trim() || undefined } : {}),
				...(input.avatar ? { avatar: input.avatar } : { avatar: undefined }),
				mentionHandle: normalizeMentionHandle(input.mentionHandle),
				abilities: {
					selectionMode: input.abilities.selectionMode ?? "custom",
					skills: [...input.abilities.skills],
					mcpServers: [...input.abilities.mcpServers],
					plugins: [...input.abilities.plugins],
					...(input.abilities.extensions ? { extensions: cloneExtensions(input.abilities.extensions) } : {}),
				},
				revision: current.revision + 1,
				updatedAt: this.now(),
			};
			const agents = [...document.agents];
			agents[index] = next;
			return {
				document: { ...document, revision: document.revision + 1, agents },
				result: next,
			};
		});
		log.info("agent profile updated", { agentProfileId, revision: result.revision });
		return result;
	}

	async deleteAgent(agentProfileId: string, input: DeleteAgentProfileInput): Promise<void> {
		const deleted = await this.mutate("delete-agent", (document) => {
			const profile = document.agents.find((agent) => agent.id === agentProfileId);
			if (!profile) throw new Error(`Agent profile not found: ${agentProfileId}`);
			// 提供方维护的档案不接受删除：它在下次启动会被原样补回来，删除只会制造「删了又回来」
			// 的错觉。UI 也不给入口，这里是最后一道闸。
			if (profile.source) throw new Error(PROVIDED_RESOURCE_WRITE_ERROR);
			if (profile.revision !== input.expectedRevision) {
				throw new Error("Agent profile changed; reload before deleting");
			}
			return {
				document: {
					...document,
					revision: document.revision + 1,
					agents: document.agents.filter((agent) => agent.id !== agentProfileId),
				},
				result: profile,
			};
		});
		log.info("agent profile deleted", { agentProfileId: deleted.id, revision: deleted.revision });
	}

	private ensureUniqueHandle(document: AgentProfileDocument, handle: string, exceptId: string | undefined): void {
		if (!handle) throw new Error("Mention handle must not be empty");
		if (document.agents.some((agent) => agent.id !== exceptId && agent.mentionHandle === handle))
			throw new Error(`Mention handle already exists: ${handle}`);
	}

	private mutate<TResult>(
		operationName: string,
		apply: (document: AgentProfileDocument) => { readonly document: AgentProfileDocument; readonly result: TResult },
	): Promise<TResult> {
		return this.enqueue(async () => {
			const current = await this.read();
			const mutation = apply(current);
			await this.persist(operationName, mutation.document);
			return mutation.result;
		});
	}

	/** 串行化所有写入：并发的两笔改动各自基于同一份旧文档，后写的那笔会吃掉前一笔。 */
	private enqueue<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
		const queued = this.mutationTail.catch(() => undefined).then(operation);
		this.mutationTail = queued.then(
			() => undefined,
			() => undefined,
		);
		return queued;
	}

	/** 校验 + 落盘 + 更新内存副本。返回规范化后的文档。 */
	private async persist(operationName: string, document: AgentProfileDocument): Promise<AgentProfileDocument> {
		const normalized = parseAgentProfileDocument({
			...document,
			schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
		});
		try {
			await this.repository.write(normalized);
		} catch (error) {
			log.error("failed to persist agent profile configuration", {
				operation: operationName,
				revision: normalized.revision,
				error: errorMessage(error),
			});
			throw error;
		}
		this.document = normalized;
		return normalized;
	}
}

export const agentProfileStore = new AgentProfileStore();

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function cloneExtensions(extensions: Readonly<Record<string, readonly string[]>>): Record<string, string[]> {
	return Object.fromEntries(Object.entries(extensions).map(([id, values]) => [id, [...values]]));
}

function createAgentAbilities(
	input: CreateAgentProfileInput["abilities"],
	defaults: AgentProfile["abilities"],
): AgentProfile["abilities"] {
	const source = input ?? defaults;
	return {
		selectionMode: input?.selectionMode ?? (input ? "custom" : defaults.selectionMode),
		skills: [...(source.skills ?? defaults.skills)],
		mcpServers: [...(source.mcpServers ?? defaults.mcpServers)],
		plugins: [...(source.plugins ?? defaults.plugins)],
		...(source.extensions ? { extensions: cloneExtensions(source.extensions) } : {}),
	};
}
