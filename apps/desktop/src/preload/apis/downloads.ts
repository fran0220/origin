import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

const DOWNLOAD_CHANNELS = {
	START: "origin:downloads:start",
	PAUSE: "origin:downloads:pause",
	RESUME: "origin:downloads:resume",
	CANCEL: "origin:downloads:cancel",
	REMOVE: "origin:downloads:remove",
	LIST: "origin:downloads:list",
	OPEN_FILE: "origin:downloads:open-file",
	SHOW_IN_FOLDER: "origin:downloads:show-in-folder",
	GET_DEFAULT_DIR: "origin:downloads:get-default-dir",
	EVENT: "origin:downloads:event",
} as const;

export function createDownloadsApi(ipc: IpcRenderer): Pick<DesktopApi, "downloads"> {
	return {
		downloads: {
			start: (params) => ipc.invoke(DOWNLOAD_CHANNELS.START, params),
			pause: (id) => ipc.invoke(DOWNLOAD_CHANNELS.PAUSE, id),
			resume: (id) => ipc.invoke(DOWNLOAD_CHANNELS.RESUME, id),
			cancel: (id) => ipc.invoke(DOWNLOAD_CHANNELS.CANCEL, id),
			remove: (id, deleteFile) => ipc.invoke(DOWNLOAD_CHANNELS.REMOVE, id, deleteFile),
			list: () => ipc.invoke(DOWNLOAD_CHANNELS.LIST),
			openFile: (id) => ipc.invoke(DOWNLOAD_CHANNELS.OPEN_FILE, id),
			showInFolder: (id) => ipc.invoke(DOWNLOAD_CHANNELS.SHOW_IN_FOLDER, id),
			getDefaultDir: () => ipc.invoke(DOWNLOAD_CHANNELS.GET_DEFAULT_DIR),
			onEvent: (handler) => onIpcEvent(ipc, DOWNLOAD_CHANNELS.EVENT, handler),
		},
	};
}
