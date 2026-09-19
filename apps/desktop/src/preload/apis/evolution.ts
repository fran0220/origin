import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHANNELS = {
	READ: "origin:evolution:read",
	COMMIT: "origin:evolution:commit",
	ROLLBACK: "origin:evolution:rollback",
	PROMOTE: "origin:evolution:promote",
	HISTORY: "origin:evolution:history",
} as const;

export function createEvolutionApi(ipc: IpcRenderer): Pick<DesktopApi, "evolution"> {
	return {
		evolution: {
			read: (scope) => ipc.invoke(CHANNELS.READ, scope),
			commit: (input) => ipc.invoke(CHANNELS.COMMIT, input),
			rollback: (input) => ipc.invoke(CHANNELS.ROLLBACK, input),
			promote: (input) => ipc.invoke(CHANNELS.PROMOTE, input),
			history: (input) => ipc.invoke(CHANNELS.HISTORY, input),
		},
	};
}
