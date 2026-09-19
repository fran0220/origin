import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANGED_EVENT = "vetta:agent-teams:changed";

export function createAgentTeamsApi(ipc: IpcRenderer): Pick<DesktopApi, "agentTeams"> {
	return {
		agentTeams: {
			list: () => ipc.invoke("vetta:agent-teams:list"),
			onChanged: (listener) => {
				const handler = (): void => listener();
				ipc.on(CHANGED_EVENT, handler);
				return () => {
					ipc.removeListener(CHANGED_EVENT, handler);
				};
			},
			listBlueprints: () => ipc.invoke("vetta:agent-teams:list-blueprints"),
			createAgent: (input) => ipc.invoke("vetta:agent-teams:create-agent", input),
			updateAgent: (id, input) => ipc.invoke("vetta:agent-teams:update-agent", id, input),
			deleteAgent: (id, input) => ipc.invoke("vetta:agent-teams:delete-agent", id, input),
			uploadAvatar: () => ipc.invoke("vetta:agent-teams:upload-avatar"),
		},
	};
}
