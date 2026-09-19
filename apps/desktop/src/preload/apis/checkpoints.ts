import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";

const CHECKPOINT_CHANNELS = {
	LIST: "origin:checkpoints:list",
	GET: "origin:checkpoints:get",
	REVERT: "origin:checkpoints:revert",
	RERUN: "origin:checkpoints:rerun-verification",
	SET_POLICY: "origin:checkpoints:set-policy",
	GET_POLICY: "origin:checkpoints:get-policy",
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
