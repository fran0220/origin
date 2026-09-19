import {
	parseCreateAgentProfileInput,
	parseDeleteAgentProfileInput,
	parseUpdateAgentProfileInput,
} from "@origin/agent-profile";
import { dialog, ipcMain, webContents } from "electron";
import { storeAgentAvatarFile } from "../agent-profiles/agent-avatar-store.js";
import { agentProfileStore } from "../agent-profiles/agent-profile-store.js";
import { initPluginAgentPresetSync } from "../agent-profiles/plugin-agent-preset-sync.js";
import { getAppLogger } from "../logger.js";

const log = getAppLogger("agent-profiles-ipc");

const CHANNELS = {
	LIST: "origin:agent-profiles:list",
	BLUEPRINTS: "origin:agent-profiles:list-blueprints",
	CREATE_AGENT: "origin:agent-profiles:create-agent",
	UPDATE_AGENT: "origin:agent-profiles:update-agent",
	DELETE_AGENT: "origin:agent-profiles:delete-agent",
	UPLOAD_AVATAR: "origin:agent-profiles:upload-avatar",
} as const;

/** 主进程推给渲染进程的「配置已变」：插件装卸与热重载会在用户没动手的情况下改动配置。 */
const CHANGED_EVENT = "origin:agent-profiles:changed";

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be a non-empty string`);
	return value;
}

interface AgentProfilesIpcDependencies {
	readonly store?: Pick<
		typeof agentProfileStore,
		"read" | "listBlueprints" | "createAgent" | "updateAgent" | "deleteAgent" | "onPluginPresetsApplied"
	>;
}

export function registerAgentProfilesIpc(
	dependencies: AgentProfilesIpcDependencies = { store: agentProfileStore },
): () => void {
	const store = dependencies.store ?? agentProfileStore;
	// 必须先于任何一次读配置：回填要按当前可用的插件 blueprint 决定铺哪些档案。
	initPluginAgentPresetSync();
	// 插件重铺预设后必须推给渲染进程：那一份文档是它自己缓存的，没有这条广播，侧边栏要等到下次
	// 重启 App 才跟上新的智能体。
	const unsubscribePresets = store.onPluginPresetsApplied(() => {
		for (const contents of webContents.getAllWebContents()) {
			if (contents.isDestroyed()) continue;
			try {
				contents.send(CHANGED_EVENT);
			} catch {
				// ignore gone frames
			}
		}
	});
	ipcMain.handle(CHANNELS.LIST, () => store.read());
	// 让用户挑一张本地图片当头像：主进程复制进头像目录，只把渲染进程能加载的 URL 交回去。
	ipcMain.handle(CHANNELS.UPLOAD_AVATAR, async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
		});
		const source = result.canceled ? undefined : result.filePaths[0];
		if (!source) return undefined;
		const stored = await storeAgentAvatarFile(source);
		return stored.url;
	});
	ipcMain.handle(CHANNELS.BLUEPRINTS, () => store.listBlueprints());
	ipcMain.handle(CHANNELS.CREATE_AGENT, (_event, input: unknown) =>
		store.createAgent(parseCreateAgentProfileInput(input)),
	);
	ipcMain.handle(CHANNELS.UPDATE_AGENT, (_event, agentProfileId: unknown, input: unknown) =>
		store.updateAgent(requiredString(agentProfileId, "agentProfileId"), parseUpdateAgentProfileInput(input)),
	);
	ipcMain.handle(CHANNELS.DELETE_AGENT, (_event, agentProfileId: unknown, input: unknown) =>
		store.deleteAgent(requiredString(agentProfileId, "agentProfileId"), parseDeleteAgentProfileInput(input)),
	);
	log.debug?.("agent profile ipc registered");
	return () => {
		unsubscribePresets();
		for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
	};
}
