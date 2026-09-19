import {
	parseCreateAgentProfileInput,
	parseDeleteAgentProfileInput,
	parseUpdateAgentProfileInput,
} from "@origin/agent-team";
import { dialog, ipcMain, webContents } from "electron";
import { storeAgentAvatarFile } from "../agent-teams/agent-avatar-store.js";
import { agentTeamStore } from "../agent-teams/agent-team-store.js";
import { initPluginAgentPresetSync } from "../agent-teams/plugin-agent-preset-sync.js";
import { getAppLogger } from "../logger.js";

const log = getAppLogger("agent-teams-ipc");

const CHANNELS = {
	LIST: "vetta:agent-teams:list",
	BLUEPRINTS: "vetta:agent-teams:list-blueprints",
	CREATE_AGENT: "vetta:agent-teams:create-agent",
	UPDATE_AGENT: "vetta:agent-teams:update-agent",
	DELETE_AGENT: "vetta:agent-teams:delete-agent",
	UPLOAD_AVATAR: "vetta:agent-teams:upload-avatar",
} as const;

/** 主进程推给渲染进程的「配置已变」：插件装卸与热重载会在用户没动手的情况下改动配置。 */
const CHANGED_EVENT = "vetta:agent-teams:changed";

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} must be a non-empty string`);
	return value;
}

interface AgentTeamsIpcDependencies {
	readonly store?: Pick<
		typeof agentTeamStore,
		"read" | "listBlueprints" | "createAgent" | "updateAgent" | "deleteAgent" | "onPluginPresetsApplied"
	>;
}

export function registerAgentTeamsIpc(dependencies: AgentTeamsIpcDependencies = { store: agentTeamStore }): () => void {
	const store = dependencies.store ?? agentTeamStore;
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
