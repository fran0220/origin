import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { getVettaHomePath } from "@origin/action-rpc";
import type { AgentProfile, AgentProfileDocument } from "@origin/agent-team";
import { parseAgentProfileDocument } from "@origin/agent-team";
import { atomicWriteFileAsync, atomicWriteJSONAsync } from "@origin/toolkit/atomic-write";
import { getAppLogger } from "../logger.js";
import { agentBlueprintRegistry, resolveAgentBlueprint } from "./agent-blueprint-registry.js";
import {
	type AgentTeamStorageIndex,
	agentDefinitionPath,
	agentTeamAgentsRoot,
	createAgentTeamStorageKey,
	readOptionalAgentTeamStorageIndex,
} from "./agent-team-storage-layout.js";
import { reconcilePluginAgentPresets } from "./plugin-agent-preset-reconcile.js";

const log = getAppLogger("agent-teams");

const TEAMS_DIR = join(getVettaHomePath(), "agent-teams");
const INITIALIZED_MARKER = ".initialized";
const INDEX_FILE = "index.json";

export interface AgentTeamFileRepository {
	read(): Promise<AgentProfileDocument>;
	write(document: AgentProfileDocument): Promise<void>;
}

export interface AgentTeamFileRepositoryOptions {
	readonly root?: string;
}

/** A directory-backed repository. JSON stores indexes; long descriptions live in Markdown files. */
export function createAgentTeamFileRepository(options: AgentTeamFileRepositoryOptions = {}): AgentTeamFileRepository {
	return new DirectoryAgentTeamRepository(options.root ?? TEAMS_DIR);
}

class DirectoryAgentTeamRepository implements AgentTeamFileRepository {
	/**
	 * 上一次读取中读坏的 Agent 目录。写回时必须保留它们：
	 * 读不出来只说明这一份数据坏了，不代表用户删除了这个 Agent。
	 */
	private unreadableAgentIds: ReadonlySet<string> = new Set();
	private storageIndex: AgentTeamStorageIndex | undefined;

	constructor(private readonly root: string) {}

	async read(): Promise<AgentProfileDocument> {
		await mkdir(this.root, { recursive: true });
		const index = await readOptionalAgentTeamStorageIndex(this.root);
		this.storageIndex = index;
		const agents = await this.readAgents(index);
		const document = parseAgentProfileDocument({
			schemaVersion: index.schemaVersion,
			revision: index.revision,
			agents,
		});
		return await this.installPresets(document, index);
	}

	/**
	 * 把配置里属于扩展的那一部分对齐到清单此刻的样子，并清掉宿主留下的装机残骸。
	 *
	 * 宿主不带装机资源：用户第一次打开时看到的智能体全部来自这一步。放在解析之后而不是
	 * 索引层，是因为预设是现造的，走完整的 parse + write 才能保证它们和用户自建的资源满足同一
	 * 套不变量。
	 *
	 * 清理排在对齐之后：被扩展接管的角色那时才盖上提供方的戳，据此才放得过它们。
	 */
	private async installPresets(
		document: AgentProfileDocument,
		index: AgentTeamStorageIndex,
	): Promise<AgentProfileDocument> {
		const reconciled = reconcilePluginAgentPresets({
			document,
			agents: agentBlueprintRegistry.listPluginAgents(),
			declarations: agentBlueprintRegistry.listPluginPresetDeclarations(),
		});
		if (!reconciled) return document;
		this.storageIndex = index;
		await this.write(reconciled.document);
		return reconciled.document;
	}

	async write(document: AgentProfileDocument): Promise<void> {
		await mkdir(this.root, { recursive: true });
		const currentIndex = this.storageIndex ?? (await readOptionalAgentTeamStorageIndex(this.root));
		const agentDirectories: Record<string, string> = {};
		for (const agent of document.agents) {
			const directory = currentIndex.agents[agent.id] ?? createAgentTeamStorageKey(agent.name, agent.id);
			agentDirectories[agent.id] = directory;
			const agentRoot = agentDefinitionPath(this.root, directory);
			await atomicWriteJSONAsync(join(agentRoot, "agent.json"), serializeAgent(agent));
			await atomicWriteFileAsync(join(agentRoot, "description.md"), agent.description);
			// 只落用户的显式覆盖：把 blueprint 默认提示词写进文件等于把默认值钉死成覆盖，
			// 之后升级 blueprint 再也到不了存量用户手里。
			if (agent.systemPrompt !== undefined)
				await atomicWriteFileAsync(join(agentRoot, "system-prompt.md"), agent.systemPrompt);
			else await rm(join(agentRoot, "system-prompt.md"), { force: true });
		}
		for (const agentId of this.unreadableAgentIds) {
			const directory = currentIndex.agents[agentId];
			if (directory) agentDirectories[agentId] = directory;
		}
		await removeDeletedMappedDirectories(agentTeamAgentsRoot(this.root), currentIndex.agents, agentDirectories);

		const nextIndex: AgentTeamStorageIndex = {
			schemaVersion: document.schemaVersion,
			revision: document.revision,
			agents: agentDirectories,
		};
		await atomicWriteJSONAsync(join(this.root, INDEX_FILE), nextIndex);
		await atomicWriteFileAsync(join(this.root, INITIALIZED_MARKER), "1\n");
		this.storageIndex = nextIndex;
	}

	/**
	 * 逐个目录读取，坏掉的那个跳过并记入 {@link unreadableAgentIds}。
	 *
	 * 这里刻意不做批量 try/catch：任何一个目录缺 `agent.json` / `description.md` 都会让整批读取
	 * 抛 ENOENT，若把它当成「一个 Agent 都没有」，随后的 write() 会按空集合清理，
	 * 把其余完好的 Agent 目录一并删掉——一次读失败会升级成永久数据丢失。
	 */
	private async readAgents(index: AgentTeamStorageIndex): Promise<AgentProfile[]> {
		const unreadable = new Set<string>();
		const agents = await Promise.all(
			Object.entries(index.agents)
				.sort((left, right) => left[1].localeCompare(right[1]))
				.map(async ([agentId, directory]) => {
					try {
						const agent = await readAgentDirectory(agentDefinitionPath(this.root, directory));
						if (agent.id !== agentId) throw new Error(`Agent directory index mismatch: ${agentId}`);
						return agent;
					} catch (error) {
						unreadable.add(agentId);
						log.error("failed to read agent profile directory", {
							directory,
							error: error instanceof Error ? error.message : String(error),
						});
						return undefined;
					}
				}),
		);
		this.unreadableAgentIds = unreadable;
		return agents.filter((agent): agent is AgentProfile => agent !== undefined);
	}
}

/** 已下线的档案字段。留在磁盘上会让 `additionalProperties: false` 的校验把整份配置判废。 */
const RETIRED_AGENT_FIELDS = ["avatarBackground"] as const;

async function readAgentDirectory(root: string): Promise<AgentProfile> {
	const value = await readJson(join(root, "agent.json"));
	for (const field of RETIRED_AGENT_FIELDS) delete value[field];
	const description = await readFile(join(root, "description.md"), "utf8");
	const systemPrompt = resolveStoredSystemPrompt(await readOptionalFile(join(root, "system-prompt.md")), value);
	return {
		...value,
		description,
		...(systemPrompt !== undefined ? { systemPrompt } : {}),
	} as AgentProfile;
}

/**
 * 判定磁盘上的 `system-prompt.md` 是不是一份**显式覆盖**。
 *
 * 空文件视为未覆盖；内容与 blueprint 默认逐字相同同样视为未覆盖——旧实现会把默认提示词
 * 物化成文件，读回来就成了显式覆盖，导致 blueprint 的后续修订永远到不了存量安装。
 * 这里顺带自愈这批数据：下一次写回时该文件会被删掉。
 */
function resolveStoredSystemPrompt(content: string | undefined, metadata: Record<string, unknown>): string | undefined {
	if (content === undefined || content.trim().length === 0) return undefined;
	const blueprintId = metadata.blueprintId;
	const fallback = typeof blueprintId === "string" ? resolveAgentBlueprint(blueprintId)?.systemPrompt : undefined;
	return fallback !== undefined && content.trimEnd() === fallback.trimEnd() ? undefined : content;
}

function serializeAgent(agent: AgentProfile): Omit<AgentProfile, "description" | "systemPrompt"> {
	const { description: _description, systemPrompt: _systemPrompt, ...metadata } = agent;
	return metadata;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
	const value: unknown = JSON.parse(await readFile(path, "utf8"));
	if (!isRecord(value)) throw new Error(`Invalid Agent Profile metadata: ${path}`);
	return value;
}

async function readOptionalFile(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (isMissingFile(error)) return undefined;
		throw error;
	}
}

async function removeDeletedMappedDirectories(
	root: string,
	current: Readonly<Record<string, string>>,
	next: Readonly<Record<string, string>>,
): Promise<void> {
	await Promise.all(
		Object.entries(current)
			.filter(([id]) => next[id] === undefined)
			.map(([, directory]) => rm(join(root, directory), { recursive: true, force: true })),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
	return isRecord(error) && error.code === "ENOENT";
}
