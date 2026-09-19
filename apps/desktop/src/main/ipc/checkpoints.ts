import type { CheckpointPolicy } from "@vetta/runtime-checkpoints";
import { ipcMain } from "electron";
import { getDesktopCheckpointService } from "../checkpoints/checkpoint-service.js";

const CHANNELS = {
	LIST: "vetta:checkpoints:list",
	GET: "vetta:checkpoints:get",
	REVERT: "vetta:checkpoints:revert",
	RERUN: "vetta:checkpoints:rerun-verification",
	SET_POLICY: "vetta:checkpoints:set-policy",
	GET_POLICY: "vetta:checkpoints:get-policy",
} as const;

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

export function registerCheckpointsIpc(): () => void {
	ipcMain.handle(CHANNELS.LIST, async (_event, projectKey?: unknown) => {
		const service = getDesktopCheckpointService();
		return service.list(isNonEmptyString(projectKey) ? projectKey : undefined);
	});
	ipcMain.handle(CHANNELS.GET, async (_event, projectKey: unknown, checkpointId: unknown) => {
		if (!isNonEmptyString(projectKey) || !isNonEmptyString(checkpointId)) {
			throw new Error("checkpoints.get requires projectKey and checkpointId");
		}
		return getDesktopCheckpointService().get(projectKey, checkpointId);
	});
	ipcMain.handle(CHANNELS.REVERT, async (_event, projectKey: unknown, checkpointId: unknown) => {
		if (!isNonEmptyString(projectKey) || !isNonEmptyString(checkpointId)) {
			throw new Error("checkpoints.revert requires projectKey and checkpointId");
		}
		return getDesktopCheckpointService().revert(projectKey, checkpointId);
	});
	ipcMain.handle(CHANNELS.RERUN, async (_event, projectKey: unknown, checkpointId: unknown) => {
		if (!isNonEmptyString(projectKey) || !isNonEmptyString(checkpointId)) {
			throw new Error("checkpoints.rerunVerification requires projectKey and checkpointId");
		}
		return getDesktopCheckpointService().rerunVerification(projectKey, checkpointId);
	});
	ipcMain.handle(CHANNELS.SET_POLICY, async (_event, policy: unknown) => {
		if (!isPolicy(policy)) throw new Error("checkpoints.setPolicy requires a CheckpointPolicy");
		return getDesktopCheckpointService().setPolicy(policy);
	});
	ipcMain.handle(CHANNELS.GET_POLICY, async (_event, projectKey: unknown) => {
		if (!isNonEmptyString(projectKey)) throw new Error("checkpoints.getPolicy requires projectKey");
		return getDesktopCheckpointService().readPolicy(projectKey);
	});
	return () => {
		ipcMain.removeHandler(CHANNELS.LIST);
		ipcMain.removeHandler(CHANNELS.GET);
		ipcMain.removeHandler(CHANNELS.REVERT);
		ipcMain.removeHandler(CHANNELS.RERUN);
		ipcMain.removeHandler(CHANNELS.SET_POLICY);
		ipcMain.removeHandler(CHANNELS.GET_POLICY);
	};
}

function isPolicy(value: unknown): value is CheckpointPolicy {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		isNonEmptyString(record.projectKey) &&
		(record.vcsMode === "shadow" || record.vcsMode === "project-mainline") &&
		(record.onVerificationFailure === "keep-for-user" || record.onVerificationFailure === "auto-revert") &&
		Array.isArray(record.verificationCommands) &&
		record.verificationCommands.every((command) => typeof command === "string")
	);
}

export { CHANNELS as CHECKPOINT_IPC_CHANNELS };
