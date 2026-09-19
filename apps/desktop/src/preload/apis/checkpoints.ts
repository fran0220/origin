import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHECKPOINT_CHANNELS = {
	LIST: "vetta:checkpoints:list",
	GET: "vetta:checkpoints:get",
	REVERT: "vetta:checkpoints:revert",
	RERUN: "vetta:checkpoints:rerun-verification",
	SET_POLICY: "vetta:checkpoints:set-policy",
	GET_POLICY: "vetta:checkpoints:get-policy",
} as const;

export function createCheckpointsApi(ipc: IpcRenderer): Pick<DesktopApi, "checkpoints"> {
	return {
		checkpoints: {
			list: (projectKey) => ipc.invoke(CHECKPOINT_CHANNELS.LIST, projectKey),
			get: (projectKey, checkpointId) => ipc.invoke(CHECKPOINT_CHANNELS.GET, projectKey, checkpointId),
			revert: (projectKey, checkpointId) => ipc.invoke(CHECKPOINT_CHANNELS.REVERT, projectKey, checkpointId),
			rerunVerification: (projectKey, checkpointId) =>
				ipc.invoke(CHECKPOINT_CHANNELS.RERUN, projectKey, checkpointId),
			setPolicy: (policy) => ipc.invoke(CHECKPOINT_CHANNELS.SET_POLICY, policy),
			getPolicy: (projectKey) => ipc.invoke(CHECKPOINT_CHANNELS.GET_POLICY, projectKey),
		},
	};
}
