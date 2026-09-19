import { ipcMain } from "electron";
import { getAppVersion, updaterService } from "../updater.js";

export function registerUpdaterIpc(): () => void {
	ipcMain.handle("origin:updater:check", async () => {
		return updaterService.check();
	});

	ipcMain.handle("origin:updater:sync", async () => {
		await updaterService.syncInBackground();
	});

	ipcMain.handle("origin:updater:get-state", () => {
		return updaterService.getState();
	});

	ipcMain.handle("origin:updater:get-current-version", () => {
		return getAppVersion();
	});

	ipcMain.handle("origin:updater:download", async () => {
		return updaterService.startDownload();
	});

	ipcMain.handle("origin:updater:install", async () => {
		await updaterService.install();
	});

	ipcMain.handle("origin:updater:dismiss", () => {
		updaterService.dismissReady();
	});

	ipcMain.handle("origin:updater:cancel", () => {
		updaterService.cancel();
	});

	return () => {
		ipcMain.removeHandler("origin:updater:check");
		ipcMain.removeHandler("origin:updater:sync");
		ipcMain.removeHandler("origin:updater:get-state");
		ipcMain.removeHandler("origin:updater:get-current-version");
		ipcMain.removeHandler("origin:updater:download");
		ipcMain.removeHandler("origin:updater:install");
		ipcMain.removeHandler("origin:updater:dismiss");
		ipcMain.removeHandler("origin:updater:cancel");
	};
}
