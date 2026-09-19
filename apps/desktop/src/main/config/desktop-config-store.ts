import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getOriginHomePath } from "@origin/action-rpc";
import { atomicWriteJSON } from "@origin/toolkit/atomic-write";
import { isLanguagePreference, type LanguagePreference } from "../../shared/i18n/config.js";
import { normalizeShortcutsConfig, type ShortcutsConfig } from "../../shared/shortcuts.js";
import { isAgentMode } from "../agent-modes/index.js";

export interface ProjectEntry {
	path: string;
	name?: string;
}

/** 实验性功能开关分组（设置页「Agent配置 → 扩展功能」）。新增实验项只加一个键。 */
export interface ExperimentalConfig {
	/** Origin CLI 提示词：开启后仅注入桌面端对话会话。缺省开。 */
	originCli?: boolean;
	/** 输入预测：每轮正常回答后预测用户下一个可能输入的 prompt。缺省关。 */
	promptPrediction?: boolean;
	/** 适配通用 Agent Skill。缺省开。 */
	agentSkills?: boolean;
}

/** Agent 图片生成 Provider 偏好；未设置时沿用内置 Provider 优先策略。 */
export interface ImageGenerationConfig {
	textToImageProviderId?: string;
	textToImageModelId?: string;
	imageToImageProviderId?: string;
	imageToImageModelId?: string;
}

export interface DesktopConfig {
	projects: ProjectEntry[];
	archivedProjects: ProjectEntry[];
	workspacePath: string;
	defaultExecutionMode: "sandbox" | "full-access";
	debugMode?: boolean;
	originAppPath?: string;
	originCliAppPath?: string;
	notificationsEnabled?: boolean;
	language?: LanguagePreference;
	/** 新建会话的默认工作模式（合法值来自 main/agent-modes 模式注册表，ADR-0071）。会话创建时固化进会话，改这里只影响之后新建的会话。 */
	defaultAgentMode?: string;
	experimental?: ExperimentalConfig;
	imageGeneration?: ImageGenerationConfig;
	knowledgeBase?: KnowledgeBaseConfig;
	shortcuts?: ShortcutsConfig;
	quickPanel?: QuickPanelConfig;
	appshot?: AppshotConfig;
	remoteControl?: {
		relayBaseUrl?: string;
		pairingId?: string;
		inputEnabled?: boolean;
	};
	recording?: RecordingConfig;
}

export interface RecordingConfig {
	/** Default retention for new recordings. */
	defaultRetention?: "30m" | "2h" | "until-cleared";
}

export type AppshotGesture = "both-shift" | "both-mod" | "both-alt";

export interface AppshotConfig {
	enabled?: boolean;
	gesture?: AppshotGesture;
}

export type QuickPanelTrigger = "none" | "mod" | "alt" | "shift";

export interface QuickPanelConfig {
	trigger?: QuickPanelTrigger;
	postSendBehavior?: "foreground" | "background";
}

export interface KnowledgeBaseConfig {
	enabled?: boolean;
	pollIntervalMinutes?: number;
	processingModelKey?: string;
	processingModelReasoningLevel?: string;
	agentConcurrency?: number;
	ocrConcurrency?: number;
}

export const DEFAULT_CONVERSATION_CWD = join(getOriginHomePath(), "conversation");
export const DEFAULT_CONVERSATION_SESSION_DIR = join(DEFAULT_CONVERSATION_CWD, ".origin", "sessions");
export const DEFAULT_IM_CONVERSATION_CWD = join(getOriginHomePath(), "im-gateway", "conversation");
export const DEFAULT_IM_CONVERSATION_SESSION_DIR = join(DEFAULT_IM_CONVERSATION_CWD, ".origin", "sessions");
export const KB_PROCESSING_CWD = join(getOriginHomePath(), "knowledges", "processing_records");
export const KB_PROCESSING_SESSION_DIR = join(KB_PROCESSING_CWD, ".origin", "sessions");

const CONFIG_PATH = join(getOriginHomePath(), "desktop-config.json");
const DEFAULT_CONFIG: DesktopConfig = {
	projects: [],
	archivedProjects: [],
	workspacePath: join(getOriginHomePath(), "workspace"),
	defaultExecutionMode: "full-access",
	defaultAgentMode: "coding",
	debugMode: false,
	notificationsEnabled: true,
	experimental: { originCli: true, agentSkills: true },
	imageGeneration: {},
	shortcuts: { bindings: {} },
	quickPanel: { trigger: "none", postSendBehavior: "foreground" },
	appshot: { enabled: false, gesture: "both-shift" },
	recording: { defaultRetention: "2h" },
};

function migrateProjectEntries(entries: unknown): ProjectEntry[] {
	if (!Array.isArray(entries) || entries.length === 0) return [];
	if (typeof entries[0] === "string") {
		return (entries as string[]).map((path) => ({ path }));
	}
	return entries as ProjectEntry[];
}

export function normalizeExecutionMode(value: unknown): "sandbox" | "full-access" {
	return value === "sandbox" ? "sandbox" : "full-access";
}

export function normalizeAgentMode(value: unknown): string {
	// 合法模式由 main/agent-modes 的 modes/*.md 注册表定义（ADR-0071）；无效值回落出厂默认 Coding。
	return isAgentMode(value) ? value : "coding";
}

const KB_POLL_INTERVALS = [3, 5, 10, 30];

export function normalizeKnowledgeBase(value: unknown): KnowledgeBaseConfig {
	if (typeof value !== "object" || value === null) {
		return { enabled: false, pollIntervalMinutes: 5 };
	}
	const input = value as Record<string, unknown>;
	const interval = typeof input.pollIntervalMinutes === "number" ? input.pollIntervalMinutes : 5;
	const clampInt = (candidate: unknown, fallback: number, min: number): number =>
		typeof candidate === "number" && Number.isFinite(candidate) && candidate >= min
			? Math.floor(candidate)
			: fallback;
	return {
		enabled: input.enabled === true,
		pollIntervalMinutes: interval === 0 || KB_POLL_INTERVALS.includes(interval) ? interval : 5,
		processingModelKey: typeof input.processingModelKey === "string" ? input.processingModelKey : undefined,
		processingModelReasoningLevel:
			typeof input.processingModelReasoningLevel === "string" ? input.processingModelReasoningLevel : undefined,
		agentConcurrency: clampInt(input.agentConcurrency, 3, 1),
		ocrConcurrency: clampInt(input.ocrConcurrency, 1, 1),
	};
}

export function normalizeQuickPanel(value: unknown): QuickPanelConfig {
	if (typeof value !== "object" || value === null) {
		return { trigger: "none", postSendBehavior: "foreground" };
	}
	const input = value as Record<string, unknown>;
	const trigger: QuickPanelTrigger =
		input.trigger === "mod" || input.trigger === "alt" || input.trigger === "shift" ? input.trigger : "none";
	return {
		trigger,
		postSendBehavior: input.postSendBehavior === "background" ? "background" : "foreground",
	};
}

export function normalizeShortcuts(value: unknown): ShortcutsConfig {
	return normalizeShortcutsConfig(value);
}

export function normalizeAppshot(value: unknown): AppshotConfig {
	if (typeof value !== "object" || value === null) return { enabled: false, gesture: "both-shift" };
	const input = value as Record<string, unknown>;
	const gesture: AppshotGesture =
		input.gesture === "both-shift" || input.gesture === "both-mod" || input.gesture === "both-alt"
			? input.gesture
			: "both-shift";
	return {
		enabled: input.enabled === true,
		gesture,
	};
}

export function normalizeExperimental(value: unknown): ExperimentalConfig {
	if (typeof value !== "object" || value === null) {
		return {
			originCli: true,
			promptPrediction: false,
			agentSkills: true,
		};
	}
	const input = value as Record<string, unknown>;
	return {
		originCli: typeof input.originCli === "boolean" ? input.originCli : true,
		promptPrediction: typeof input.promptPrediction === "boolean" ? input.promptPrediction : false,
		agentSkills: typeof input.agentSkills === "boolean" ? input.agentSkills : true,
	};
}

export function normalizeImageGeneration(value: unknown): ImageGenerationConfig {
	if (typeof value !== "object" || value === null) return {};
	const input = value as Record<string, unknown>;
	return {
		textToImageProviderId:
			typeof input.textToImageProviderId === "string" && input.textToImageProviderId.trim().length > 0
				? input.textToImageProviderId
				: undefined,
		textToImageModelId:
			typeof input.textToImageModelId === "string" && input.textToImageModelId.trim().length > 0
				? input.textToImageModelId
				: undefined,
		imageToImageProviderId:
			typeof input.imageToImageProviderId === "string" && input.imageToImageProviderId.trim().length > 0
				? input.imageToImageProviderId
				: undefined,
		imageToImageModelId:
			typeof input.imageToImageModelId === "string" && input.imageToImageModelId.trim().length > 0
				? input.imageToImageModelId
				: undefined,
	};
}

export async function readDesktopConfig(): Promise<DesktopConfig> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		return parseDesktopConfig(JSON.parse(raw) as Record<string, unknown>);
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export function readConfigSync(): DesktopConfig {
	try {
		const raw = readFileSync(CONFIG_PATH, "utf8");
		return parseDesktopConfig(JSON.parse(raw) as Record<string, unknown>);
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

function parseDesktopConfig(parsed: Record<string, unknown>): DesktopConfig {
	return {
		projects: migrateProjectEntries(parsed.projects),
		archivedProjects: migrateProjectEntries(parsed.archivedProjects),
		workspacePath:
			typeof parsed.workspacePath === "string"
				? expandTildePath(parsed.workspacePath)
				: DEFAULT_CONFIG.workspacePath,
		defaultExecutionMode: normalizeExecutionMode(parsed.defaultExecutionMode),
		defaultAgentMode: normalizeAgentMode(parsed.defaultAgentMode),
		debugMode: typeof parsed.debugMode === "boolean" ? parsed.debugMode : false,
		originAppPath: typeof parsed.originAppPath === "string" ? parsed.originAppPath : undefined,
		originCliAppPath: typeof parsed.originCliAppPath === "string" ? parsed.originCliAppPath : undefined,
		notificationsEnabled: typeof parsed.notificationsEnabled === "boolean" ? parsed.notificationsEnabled : true,
		language: isLanguagePreference(parsed.language) ? parsed.language : undefined,
		experimental: normalizeExperimental(parsed.experimental),
		imageGeneration: normalizeImageGeneration(parsed.imageGeneration),
		knowledgeBase: normalizeKnowledgeBase(parsed.knowledgeBase),
		shortcuts: normalizeShortcuts(parsed.shortcuts),
		quickPanel: normalizeQuickPanel(parsed.quickPanel),
		appshot: normalizeAppshot(parsed.appshot),
		remoteControl: normalizeRemoteControl(parsed.remoteControl),
		recording: normalizeRecording(parsed.recording),
	};
}

export function normalizeRecording(value: unknown): RecordingConfig {
	if (typeof value !== "object" || value === null) return { defaultRetention: "2h" };
	const input = value as Record<string, unknown>;
	const retention = input.defaultRetention;
	if (retention === "30m" || retention === "2h" || retention === "until-cleared") {
		return { defaultRetention: retention };
	}
	return { defaultRetention: "2h" };
}

function normalizeRemoteControl(value: unknown): DesktopConfig["remoteControl"] {
	if (typeof value !== "object" || value === null) return undefined;
	const input = value as Record<string, unknown>;
	return {
		relayBaseUrl: typeof input.relayBaseUrl === "string" ? input.relayBaseUrl : undefined,
		pairingId: typeof input.pairingId === "string" ? input.pairingId : undefined,
		inputEnabled: input.inputEnabled === true,
	};
}

export async function writeDesktopConfig(config: DesktopConfig): Promise<void> {
	atomicWriteJSON(CONFIG_PATH, config);
}

export async function persistVettaCliPaths(paths: { originAppPath: string; originCliAppPath: string }): Promise<void> {
	const config = await readDesktopConfig();
	if (config.originAppPath === paths.originAppPath && config.originCliAppPath === paths.originCliAppPath) return;
	await writeDesktopConfig({ ...config, ...paths });
}

export function expandTildePath(path: string): string {
	if (path.startsWith("~/") || path === "~") {
		return join(homedir(), path.slice(1));
	}
	return path;
}
