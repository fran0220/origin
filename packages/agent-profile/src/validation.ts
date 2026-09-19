import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type {
	AgentProfileDocument,
	CreateAgentProfileInput,
	DeleteAgentProfileInput,
	UpdateAgentProfileInput,
} from "./contracts.js";
import { AGENT_PROFILE_SCHEMA_VERSION } from "./contracts.js";
import { normalizeMentionHandle } from "./domain.js";

const id = Type.String({ minLength: 1, maxLength: 256, pattern: "^\\S(?:[^\\r\\n]*\\S)?$" });
const text = Type.String({ maxLength: 64_000 });
const timestamp = Type.Number({ minimum: 0 });
const revision = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
const stringList = Type.Array(id, { maxItems: 512, uniqueItems: true });
const abilities = Type.Object(
	{
		selectionMode: Type.Union([Type.Literal("all"), Type.Literal("custom")]),
		skills: stringList,
		mcpServers: stringList,
		plugins: stringList,
		extensions: Type.Optional(Type.Record(id, stringList)),
	},
	{ additionalProperties: false },
);
const optionalAbilities = Type.Partial(abilities, { additionalProperties: false });
const resourceSource = Type.Object(
	{
		kind: Type.Literal("plugin"),
		pluginId: id,
		nameKey: Type.Optional(id),
		descriptionKey: Type.Optional(id),
	},
	{ additionalProperties: false },
);
const profile = Type.Object(
	{
		id,
		revision: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
		name: Type.String({ minLength: 1, maxLength: 128, pattern: "\\S" }),
		description: text,
		avatar: Type.Optional(Type.String({ maxLength: 2_048 })),
		mentionHandle: id,
		blueprintId: id,
		systemPrompt: Type.Optional(text),
		abilities,
		scope: Type.Object({ kind: Type.Literal("library") }, { additionalProperties: false }),
		copiedFrom: Type.Optional(id),
		source: Type.Optional(resourceSource),
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{ additionalProperties: false },
);

export const CreateAgentProfileInputSchema = Type.Object(
	{
		name: Type.String({ minLength: 1, maxLength: 128, pattern: "\\S" }),
		description: Type.Optional(text),
		avatar: Type.Optional(Type.String({ maxLength: 2_048 })),
		mentionHandle: id,
		blueprintId: id,
		abilities: Type.Optional(optionalAbilities),
	},
	{ additionalProperties: false },
);
export const UpdateAgentProfileInputSchema = Type.Object(
	{
		expectedRevision: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
		name: Type.String({ minLength: 1, maxLength: 128, pattern: "\\S" }),
		description: text,
		avatar: Type.Optional(Type.String({ maxLength: 2_048 })),
		mentionHandle: id,
		systemPrompt: Type.Optional(text),
		abilities,
	},
	{ additionalProperties: false },
);
export const DeleteAgentProfileInputSchema = Type.Object(
	{
		expectedRevision: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
	},
	{ additionalProperties: false },
);

export const AgentProfileDocumentSchema = Type.Object(
	{
		schemaVersion: Type.Literal(AGENT_PROFILE_SCHEMA_VERSION),
		revision,
		agents: Type.Array(profile, { maxItems: 1_024 }),
	},
	{ additionalProperties: false },
);

type ParsedAgentProfileDocument = Static<typeof AgentProfileDocumentSchema>;

export function createEmptyAgentProfileDocument(): AgentProfileDocument {
	return { schemaVersion: AGENT_PROFILE_SCHEMA_VERSION, revision: 0, agents: [] };
}

export function parseAgentProfileDocument(value: unknown): AgentProfileDocument {
	if (!Value.Check(AgentProfileDocumentSchema, value)) throw new Error("Invalid Agent Profile configuration document");
	const document: ParsedAgentProfileDocument = value;
	const ids = new Set<string>();
	const libraryHandles = new Set<string>();
	const agents = [];
	// 这里刻意不校验 blueprintId 是否可解析：插件贡献的 blueprint 随插件装卸，禁用插件后
	// 引用它的档案会暂时找不到 blueprint。那是可降级展示的正常状态，不是脏数据——为它
	// 抛错会让整份配置读废，用户失去的是全部智能体而不是一个。
	for (const agent of document.agents) {
		if (ids.has(agent.id)) throw new Error(`Duplicate agent profile id: ${agent.id}`);
		ids.add(agent.id);
		const handle = normalizeMentionHandle(agent.mentionHandle);
		if (libraryHandles.has(handle)) throw new Error(`Duplicate library agent handle: ${agent.mentionHandle}`);
		libraryHandles.add(handle);
		agents.push(agent);
	}
	return {
		schemaVersion: AGENT_PROFILE_SCHEMA_VERSION,
		revision: document.revision,
		agents,
	};
}

export function parseCreateAgentProfileInput(value: unknown): CreateAgentProfileInput {
	if (!Value.Check(CreateAgentProfileInputSchema, value)) throw new Error("Invalid create agent profile input");
	return value as CreateAgentProfileInput;
}

export function parseUpdateAgentProfileInput(value: unknown): UpdateAgentProfileInput {
	if (!Value.Check(UpdateAgentProfileInputSchema, value)) throw new Error("Invalid update agent profile input");
	return value as UpdateAgentProfileInput;
}

export function parseDeleteAgentProfileInput(value: unknown): DeleteAgentProfileInput {
	if (!Value.Check(DeleteAgentProfileInputSchema, value)) throw new Error("Invalid delete agent profile input");
	return value as DeleteAgentProfileInput;
}
