import { ipcMain } from "electron";
import { type ConnectionDraft, getConnectionCatalog } from "../connections/catalog.js";
import { bindModelRuntimeToConnectionRelays } from "../connections/runtime-binding.js";
import { getDesktopCredentialVaultWarning } from "../credentials/desktop-credential-vault.js";

export function registerConnectionsIpc(): () => void {
	ipcMain.handle("origin:connections:list", () => ({
		connections: getConnectionCatalog().list(),
		warning: getDesktopCredentialVaultWarning() ?? null,
	}));
	ipcMain.handle("origin:connections:upsert", async (_event, draft: ConnectionDraft) => {
		const state = getConnectionCatalog().upsertProvided(draft);
		await bindModelRuntimeToConnectionRelays();
		return state;
	});
	ipcMain.handle("origin:connections:remove", async (_event, id: unknown) => {
		if (typeof id !== "string" || id.length === 0) return;
		getConnectionCatalog().remove(id);
		await bindModelRuntimeToConnectionRelays();
	});
	ipcMain.handle("origin:connections:quota", async (_event, id: unknown) => {
		if (typeof id !== "string") return { status: "unknown", readAt: new Date().toISOString() };
		const state = getConnectionCatalog().get(id);
		return {
			status: state?.quota?.status ?? "unknown",
			readAt: new Date().toISOString(),
			...(state?.quota?.windows ? { windows: state.quota.windows } : {}),
		};
	});
	return () => {
		ipcMain.removeHandler("origin:connections:list");
		ipcMain.removeHandler("origin:connections:upsert");
		ipcMain.removeHandler("origin:connections:remove");
		ipcMain.removeHandler("origin:connections:quota");
	};
}
