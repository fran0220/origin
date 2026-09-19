import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

const SCHEDULER_CHANNELS = {
	GET_TASKS: "origin:scheduler:get-tasks",
	CREATE_TASK: "origin:scheduler:create-task",
	UPDATE_TASK: "origin:scheduler:update-task",
	DELETE_TASK: "origin:scheduler:delete-task",
	TOGGLE_TASK: "origin:scheduler:toggle-task",
	DISABLE_TASK: "origin:scheduler:disable-task",
	GET_RECORDS: "origin:scheduler:get-records",
	GET_RUNNING: "origin:scheduler:get-running",
	GET_SESSION_PATHS: "origin:scheduler:get-session-paths",
	DELETE_RECORD_BY_SESSION: "origin:scheduler:delete-record-by-session",
	RUN_NOW: "origin:scheduler:run-now",
	ABORT: "origin:scheduler:abort",
	EVENT: "origin:scheduler:event",
} as const;

export function createSchedulerApi(ipc: IpcRenderer): Pick<DesktopApi, "scheduler"> {
	return {
		scheduler: {
			getTasks: () => ipc.invoke(SCHEDULER_CHANNELS.GET_TASKS),
			createTask: (task) => ipc.invoke(SCHEDULER_CHANNELS.CREATE_TASK, task),
			updateTask: (id, patch) => ipc.invoke(SCHEDULER_CHANNELS.UPDATE_TASK, id, patch),
			deleteTask: (id) => ipc.invoke(SCHEDULER_CHANNELS.DELETE_TASK, id),
			toggleTask: (id) => ipc.invoke(SCHEDULER_CHANNELS.TOGGLE_TASK, id),
			disableTask: (id) => ipc.invoke(SCHEDULER_CHANNELS.DISABLE_TASK, id),
			getRecords: (taskId) => ipc.invoke(SCHEDULER_CHANNELS.GET_RECORDS, taskId),
			getRunningTaskIds: () => ipc.invoke(SCHEDULER_CHANNELS.GET_RUNNING),
			getScheduledSessionPaths: () => ipc.invoke(SCHEDULER_CHANNELS.GET_SESSION_PATHS),
			deleteRecordsBySession: (sessionPath) => ipc.invoke(SCHEDULER_CHANNELS.DELETE_RECORD_BY_SESSION, sessionPath),
			runTaskNow: (id) => ipc.invoke(SCHEDULER_CHANNELS.RUN_NOW, id),
			abortTask: (id) => ipc.invoke(SCHEDULER_CHANNELS.ABORT, id),
			onTaskEvent: (handler) => onIpcEvent(ipc, SCHEDULER_CHANNELS.EVENT, handler),
		},
	};
}
