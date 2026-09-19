import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("originRemoteDesktop", {
	onInput(message: unknown): void {
		ipcRenderer.send("origin:remote-desktop:input", message);
	},
});
