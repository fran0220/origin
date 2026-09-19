import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

const NOTIFICATION_CHANNELS = {
	SET_FOREGROUND: "origin:notification:set-foreground-session",
	NAVIGATE: "origin:notification:navigate",
} as const;

export function createNotificationApi(ipc: IpcRenderer): Pick<DesktopApi, "notification"> {
	return {
		notification: {
			setForegroundSession: (sessionPath) => ipc.invoke(NOTIFICATION_CHANNELS.SET_FOREGROUND, sessionPath),
			onNavigate: (handler) => onIpcEvent(ipc, NOTIFICATION_CHANNELS.NAVIGATE, handler),
		},
	};
}
