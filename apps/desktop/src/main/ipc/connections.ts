import { ipcMain } from "electron";
import { type ConnectionDraft, getConnectionCatalog } from "../connections/catalog.js";
import { bindModelRuntimeToConnectionRelays } from "../connections/runtime-binding.js";
import { getDesktopCredentialVaultWarning } from "../credentials/desktop-credential-vault.js";

export function registerConnectionsIpc(): () => void {
	ipcMain.handle("vetta:connections:list", () => ({
		connections: getConnectionCatalog().list(),
		warning: getDesktopCredentialVaultWarning() ?? null,
	}));
	ipcMain.handle("vetta:connections:upsert", async (_event, draft: ConnectionDraft) => {
		const state = getConnectionCatalog().upsertProvided(draft);
		await bindModelRuntimeToConnectionRelays();
		return state;
	});
	ipcMain.handle("vetta:connections:remove", async (_event, id: unknown) => {
		if (typeof id !== "string" || id.length === 0) return;
		getConnectionCatalog().remove(id);
		await bindModelRuntimeToConnectionRelays();
	});
	ipcMain.handle("vetta:connections:quota", async (_event, id: unknown) => {
		if (typeof id !== "string") return { status: "unknown", readAt: new Date().toISOString() };
		const state = getConnectionCatalog().get(id);
		return {
			status: state?.quota?.status ?? "unknown",
			readAt: new Date().toISOString(),
			...(state?.quota?.windows ? { windows: state.quota.windows } : {}),
		};
	});
	return () => {
		ipcMain.removeHandler("vetta:connections:list");
		ipcMain.removeHandler("vetta:connections:upsert");
		ipcMain.removeHandler("vetta:connections:remove");
		ipcMain.removeHandler("vetta:connections:quota");
	};
}
