/**
 * 知识库相关 IPC：
 * - 手动「立即整理」（起一轮加工）、保存设置后重载轮询器。
 * - raws ↔ UI 的读（list/tree）与写（增删改，走特权互斥写）。
 * 缓存重建无需手动触发——由加工轮收尾与轮询器启动自愈自动完成。
 */

import { ipcMain } from "electron";
import { getKnowledgeService } from "./knowledge-service.js";

const CHANNELS = {
	SCAN_NOW: "origin:kb:scan-now",
	RETRY_FAILED: "origin:kb:retry-failed",
	RELOAD: "origin:kb:reload",
	IS_PROCESSING: "origin:kb:is-processing",
	LIST: "origin:kb:list",
	LIST_DIR: "origin:kb:list-dir",
	STATUSES: "origin:kb:statuses",
	ADD_FILES: "origin:kb:add-files",
	DELETE_ENTRY: "origin:kb:delete-entry",
	RENAME_ENTRY: "origin:kb:rename-entry",
	CREATE: "origin:kb:create",
	DELETE: "origin:kb:delete",
	RENAME: "origin:kb:rename",
	CLEAR_WIKI: "origin:kb:clear-wiki",
	CLEAR_RECORDS: "origin:kb:clear-records",
	DELETE_WIKI: "origin:kb:delete-wiki",
} as const;

export function registerKnowledgeIpc(): void {
	const service = getKnowledgeService();
	ipcMain.handle(CHANNELS.SCAN_NOW, () => service.scanNow());
	ipcMain.handle(CHANNELS.RETRY_FAILED, () => service.retryFailed());
	ipcMain.handle(CHANNELS.RELOAD, () => service.reload());
	ipcMain.handle(CHANNELS.IS_PROCESSING, () => service.isProcessing());
	ipcMain.handle(CHANNELS.LIST, () => service.listBases());
	ipcMain.handle(CHANNELS.LIST_DIR, (_e, kbId: string, relPath: string) => service.listDirectory(kbId, relPath ?? ""));
	ipcMain.handle(CHANNELS.STATUSES, () => service.listFileStatuses());
	ipcMain.handle(CHANNELS.ADD_FILES, (_e, kbId: string, sourcePaths: string[], move: boolean) =>
		service.addFiles(kbId, sourcePaths, move),
	);
	ipcMain.handle(CHANNELS.DELETE_ENTRY, (_e, kbId: string, relPath: string) => service.deleteEntry(kbId, relPath));
	ipcMain.handle(CHANNELS.RENAME_ENTRY, (_e, kbId: string, relPath: string, newName: string) =>
		service.renameEntry(kbId, relPath, newName),
	);
	ipcMain.handle(CHANNELS.CREATE, (_e, name: string) => service.createBase(name));
	ipcMain.handle(CHANNELS.DELETE, (_e, name: string) => service.deleteBase(name));
	ipcMain.handle(CHANNELS.RENAME, (_e, oldName: string, newName: string) => service.renameBase(oldName, newName));
	ipcMain.handle(CHANNELS.CLEAR_WIKI, () => service.clearWiki());
	ipcMain.handle(CHANNELS.CLEAR_RECORDS, () => service.clearRecords());
	ipcMain.handle(CHANNELS.DELETE_WIKI, (_e, kbId: string, relPaths: string[]) => service.deleteWiki(kbId, relPaths));
}

export function unregisterKnowledgeIpc(): void {
	for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
}
