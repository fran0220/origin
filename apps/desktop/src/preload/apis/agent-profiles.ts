import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANGED_EVENT = "origin:agent-profiles:changed";

export function createAgentProfilesApi(ipc: IpcRenderer): Pick<DesktopApi, "agentProfiles"> {
	return {
		agentProfiles: {
			list: () => ipc.invoke("origin:agent-profiles:list"),
			onChanged: (listener) => {
				const handler = (): void => listener();
				ipc.on(CHANGED_EVENT, handler);
				return () => {
					ipc.removeListener(CHANGED_EVENT, handler);
				};
			},
			listBlueprints: () => ipc.invoke("origin:agent-profiles:list-blueprints"),
			createAgent: (input) => ipc.invoke("origin:agent-profiles:create-agent", input),
			updateAgent: (id, input) => ipc.invoke("origin:agent-profiles:update-agent", id, input),
			deleteAgent: (id, input) => ipc.invoke("origin:agent-profiles:delete-agent", id, input),
			uploadAvatar: () => ipc.invoke("origin:agent-profiles:upload-avatar"),
		},
	};
}
