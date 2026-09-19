import type { IpcRenderer } from "electron";
import type { RemotePairingApi } from "../api-types/remote-pairing.js";

export function createRemotePairingApi(ipc: Pick<IpcRenderer, "invoke">): RemotePairingApi {
	return {
		getState: () => ipc.invoke("origin:remote-pairing:get-state"),
		create: (relayBaseUrl) => ipc.invoke("origin:remote-pairing:create", relayBaseUrl),
		setInputEnabled: (enabled) => ipc.invoke("origin:remote-pairing:set-input-enabled", enabled),
		revoke: () => ipc.invoke("origin:remote-pairing:revoke"),
	};
}
