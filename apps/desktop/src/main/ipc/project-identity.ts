import { isAbsolute } from "node:path";
import { type IpcMainInvokeEvent, ipcMain } from "electron";
import { resolveDesktopCapabilityProject } from "../projects/capability-project.js";

export const PROJECT_IDENTITY_CHANNELS = {
	RESOLVE: "origin:project:resolve",
} as const;

function requireAbsoluteCwd(value: unknown): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new Error("cwd is required");
	}
	if (!isAbsolute(value)) {
		throw new Error("cwd must be an absolute path");
	}
	return value;
}

export function registerProjectIdentityIpc(): () => void {
	ipcMain.handle(PROJECT_IDENTITY_CHANNELS.RESOLVE, async (_event: IpcMainInvokeEvent, cwd: unknown) =>
		resolveDesktopCapabilityProject(requireAbsoluteCwd(cwd)),
	);
	return () => {
		ipcMain.removeHandler(PROJECT_IDENTITY_CHANNELS.RESOLVE);
	};
}
