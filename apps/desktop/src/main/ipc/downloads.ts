import { ipcMain, type WebContents } from "electron";
import type { DownloadStartParams } from "../../preload/api-types/downloads.js";
import { getDesktopDownloadService } from "../downloads/download-service.js";

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

export { DOWNLOAD_CHANNELS };

export function registerDownloadsIpc(webContents: WebContents): () => void {
	const downloads = getDesktopDownloadService();
	const detachEventSink = downloads.attachEventSink((event) => {
		if (!webContents.isDestroyed()) webContents.send(DOWNLOAD_CHANNELS.EVENT, event);
	});
	ipcMain.handle(DOWNLOAD_CHANNELS.START, (_event, params: DownloadStartParams) => downloads.start(params));
	ipcMain.handle(DOWNLOAD_CHANNELS.PAUSE, (_event, id: string) => downloads.pause(id));
	ipcMain.handle(DOWNLOAD_CHANNELS.RESUME, (_event, id: string) => downloads.resume(id));
	ipcMain.handle(DOWNLOAD_CHANNELS.CANCEL, (_event, id: string) => downloads.cancel(id));
	ipcMain.handle(DOWNLOAD_CHANNELS.REMOVE, (_event, id: string, deleteFile: boolean) =>
		downloads.remove(id, deleteFile),
	);
	ipcMain.handle(DOWNLOAD_CHANNELS.LIST, () => downloads.list());
	ipcMain.handle(DOWNLOAD_CHANNELS.OPEN_FILE, (_event, id: string) => downloads.openFile(id));
	ipcMain.handle(DOWNLOAD_CHANNELS.SHOW_IN_FOLDER, (_event, id: string) => downloads.showInFolder(id));
	ipcMain.handle(DOWNLOAD_CHANNELS.GET_DEFAULT_DIR, () => downloads.getDefaultDir());

	return () => {
		detachEventSink();
		for (const channel of Object.values(DOWNLOAD_CHANNELS)) {
			if (channel !== DOWNLOAD_CHANNELS.EVENT) ipcMain.removeHandler(channel);
		}
	};
}
