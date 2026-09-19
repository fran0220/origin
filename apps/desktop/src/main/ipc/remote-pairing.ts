import { ipcMain } from "electron";
import type { DesktopRemotePairingService } from "../remote-control/desktop-remote-pairing-service.js";

export function registerRemotePairingIpc(service: DesktopRemotePairingService): () => void {
	ipcMain.handle("origin:remote-pairing:get-state", () => service.getState());
	ipcMain.handle("origin:remote-pairing:create", async (_event, relayBaseUrl: unknown) =>
		service.create(typeof relayBaseUrl === "string" ? relayBaseUrl : undefined),
	);
	ipcMain.handle("origin:remote-pairing:set-input-enabled", async (_event, enabled: unknown) =>
		service.setInputEnabled(enabled === true),
	);
	ipcMain.handle("origin:remote-pairing:revoke", async () => {
		await service.revoke();
		return service.getState();
	});
	return () => {
		ipcMain.removeHandler("origin:remote-pairing:get-state");
		ipcMain.removeHandler("origin:remote-pairing:create");
		ipcMain.removeHandler("origin:remote-pairing:set-input-enabled");
		ipcMain.removeHandler("origin:remote-pairing:revoke");
	};
}
