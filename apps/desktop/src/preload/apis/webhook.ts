import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const WEBHOOK_CHANNELS = {
	LIST: "origin:webhook:list",
	LIST_PROVIDERS: "origin:webhook:list-providers",
	CREATE: "origin:webhook:create",
	UPDATE: "origin:webhook:update",
	DELETE: "origin:webhook:delete",
	TOGGLE: "origin:webhook:toggle",
	TEST: "origin:webhook:test",
	SEND: "origin:webhook:send",
} as const;

export function createWebhookApi(ipc: IpcRenderer): Pick<DesktopApi, "webhook"> {
	return {
		webhook: {
			list: () => ipc.invoke(WEBHOOK_CHANNELS.LIST),
			listProviders: () => ipc.invoke(WEBHOOK_CHANNELS.LIST_PROVIDERS),
			create: (input) => ipc.invoke(WEBHOOK_CHANNELS.CREATE, input),
			update: (id, patch) => ipc.invoke(WEBHOOK_CHANNELS.UPDATE, id, patch),
			delete: (id) => ipc.invoke(WEBHOOK_CHANNELS.DELETE, id),
			toggle: (id, enabled) => ipc.invoke(WEBHOOK_CHANNELS.TOGGLE, id, enabled),
			test: (id) => ipc.invoke(WEBHOOK_CHANNELS.TEST, id),
			send: (id, message) => ipc.invoke(WEBHOOK_CHANNELS.SEND, id, message),
		},
	};
}
