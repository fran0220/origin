import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import type { DesktopThemeStorageChangedEvent } from "../api-types/themes.js";
import { onIpcEvent } from "./helper.js";

export function createThemesApi(ipc: IpcRenderer): Pick<DesktopApi, "themes"> {
	return {
		themes: {
			list: () => ipc.invoke("origin:themes:list"),
			storage: {
				getAll: (themeId) => ipc.invoke("origin:themes:storage:get-all", themeId),
				set: (themeId, key, value) => ipc.invoke("origin:themes:storage:set", themeId, key, value),
				remove: (themeId, key) => ipc.invoke("origin:themes:storage:remove", themeId, key),
				clear: (themeId) => ipc.invoke("origin:themes:storage:clear", themeId),
				onChanged: (handler) =>
					onIpcEvent<DesktopThemeStorageChangedEvent>(ipc, "origin:themes:storage:changed", handler),
			},
		},
	};
}
