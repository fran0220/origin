import { VETTA_CLI_GUIDANCE } from "@origin/coding-agent/cli-guidance";
import { createCodingAgentRuntimeSessionSelection } from "@origin/coding-agent/composition";
import type { AgentConfigurationSelection, ConversationScenario } from "@origin/coding-agent/profile";
import type {
	CodingAgentPinnedModelContextBinder,
	CodingAgentRuntimeToolRegistration,
} from "@origin/coding-agent/runtime";
import type { SessionConfig } from "@origin/runtime-core";
import { DEFAULT_AGENT_MODE } from "../agent-modes/index.js";
import { allowProjectRoot, readDesktopConfig } from "../ipc/fs.js";
import { type DesktopAgentMode, readSessionAgentMode } from "./session-agent-mode-store.js";
import {
	ensureConversationSubCwd,
	ensureSessionWorkingCwd,
	readSessionCwdFromHeader,
	resolveSessionDirForCwd,
} from "./session-paths.js";

export type DesktopConversationSource = "interactive" | "debug";
export type DesktopSessionKind = "conversation" | "other";

/** Desktop 的 Coding Agent 产品输入；产品字段不会进入 Runtime Core 的 SessionConfig。 */
export interface DesktopCodingAgentSessionConfig extends SessionConfig {
	readonly scenario?: ConversationScenario;
	readonly agentMode?: DesktopAgentMode;
	/**
	 * 本会话绑定的 Agent Profile 身份（新建时由渲染层传入）。这里只是身份：
	 * 人格与能力白名单由 desktop-conversation-service 查表折算成 agentConfiguration
	 * 与 systemPromptVolatileAddon 后再进来，渲染层无从自述能力。
	 */
	readonly agentProfileId?: string;
	readonly appendSystemPrompt?: string;
	readonly systemPromptCachePrefixAddon?: string;
	readonly systemPromptVolatileAddon?: string;
	readonly enableBackgroundTasks?: boolean;
	readonly includeAgentSkills?: boolean;
	readonly automaticRetry?: boolean;
	readonly agentConfiguration?: AgentConfigurationSelection;
	readonly sessionRuntimeTools?: readonly CodingAgentRuntimeToolRegistration[];
	readonly bindPinnedModelContext?: CodingAgentPinnedModelContextBinder;
	readonly promptCacheKey?: string;
}

export interface ResolvedDesktopSessionConfig {
	config: SessionConfig;
	cwd: string;
	scenario: ConversationScenario;
	includeAgentSkills: boolean;
	/** 本会话固化的工作模式；创建后由调用方落盘，会话内不可变。 */
	agentMode: DesktopAgentMode;
}

/**
 * 工作模式的唯一来源：
 * - 新建会话取 desktop-config 的 defaultAgentMode（新会话默认值）；
 * - 恢复已有会话取该会话创建时固化的记录；缺记录回落出厂默认 Coding，
 *   不跟随用户当前改过的默认值。
 */
async function resolveSessionAgentMode(
	existingSessionPath: string | undefined,
	defaultAgentMode: DesktopAgentMode,
): Promise<DesktopAgentMode> {
	if (!existingSessionPath) return defaultAgentMode;
	return (await readSessionAgentMode(existingSessionPath)) ?? DEFAULT_AGENT_MODE;
}

export async function resolveDesktopSessionConfig(
	config: DesktopCodingAgentSessionConfig | undefined,
	kind: DesktopSessionKind,
	source: DesktopConversationSource,
): Promise<ResolvedDesktopSessionConfig> {
	const requestedCwd = config?.cwd ?? process.cwd();
	allowProjectRoot(requestedCwd);
	const injectedSessionDir = config?.sessionDir ?? resolveSessionDirForCwd(requestedCwd);
	const cwdFromExistingHeader = config?.sessionPath ? await readSessionCwdFromHeader(config.sessionPath) : undefined;
	const effectiveCwd = cwdFromExistingHeader ?? (await ensureConversationSubCwd(requestedCwd)) ?? requestedCwd;
	await ensureSessionWorkingCwd(effectiveCwd);
	if (effectiveCwd !== requestedCwd) {
		allowProjectRoot(effectiveCwd);
	}

	const isConversation = kind === "conversation";
	const scenario: ConversationScenario = config?.scenario ?? (isConversation ? "conversation" : "project");
	const desktopConfig = await readDesktopConfig();
	const enableBackgroundTasks = source === "interactive" && scenario !== "batch";
	const includeAgentSkills = desktopConfig.experimental?.agentSkills !== false;
	const appendSystemPrompt =
		isConversation && desktopConfig.experimental?.vettaCli === true
			? config?.appendSystemPrompt
				? `${config.appendSystemPrompt}\n\n${VETTA_CLI_GUIDANCE}`
				: VETTA_CLI_GUIDANCE
			: config?.appendSystemPrompt;
	const agentMode = await resolveSessionAgentMode(
		config?.sessionPath,
		desktopConfig.defaultAgentMode ?? DEFAULT_AGENT_MODE,
	);
	const {
		scenario: _scenario,
		agentMode: _agentMode,
		agentProfileId: _agentProfileId,
		appendSystemPrompt: _appendSystemPrompt,
		systemPromptCachePrefixAddon: _systemPromptCachePrefixAddon,
		systemPromptVolatileAddon: _systemPromptVolatileAddon,
		enableBackgroundTasks: _enableBackgroundTasks,
		includeAgentSkills: _includeAgentSkills,
		automaticRetry: _automaticRetry,
		bindPinnedModelContext: _bindPinnedModelContext,
		promptCacheKey: _promptCacheKey,
		agentConfiguration: _agentConfiguration,
		sessionRuntimeTools: _sessionRuntimeTools,
		...runtimeConfig
	} = config ?? {};
	return {
		config: {
			...runtimeConfig,
			agent: createCodingAgentRuntimeSessionSelection(
				{
					sessionId: config?.sessionId,
					scenario,
					agentMode,
					systemPromptAddon: appendSystemPrompt,
					systemPromptCachePrefixAddon: config?.systemPromptCachePrefixAddon,
					systemPromptVolatileAddon: config?.systemPromptVolatileAddon,
					enableBackgroundTasks,
					includeAgentSkills,
					automaticRetry: config?.automaticRetry,
					agentConfiguration: config?.agentConfiguration,
					sessionRuntimeTools: config?.sessionRuntimeTools,
					bindPinnedModelContext: config?.bindPinnedModelContext,
					promptCacheKey: config?.promptCacheKey,
				},
				config?.agent,
			),
			cwd: effectiveCwd,
			sessionDir: injectedSessionDir ?? config?.sessionDir,
		},
		cwd: effectiveCwd,
		scenario,
		includeAgentSkills,
		agentMode,
	};
}
