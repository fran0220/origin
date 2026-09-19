import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import { onIpcEvent } from "./helper.js";

const BATCH_TASKS_CHANNELS = {
	GET_PROJECTS: "origin:batch-tasks:get-projects",
	CREATE_PROJECT: "origin:batch-tasks:create-project",
	UPDATE_PROJECT: "origin:batch-tasks:update-project",
	DELETE_PROJECT: "origin:batch-tasks:delete-project",
	RUN_TASK: "origin:batch-tasks:run-task",
	RETRY_TASK: "origin:batch-tasks:retry-task",
	STOP_TASK: "origin:batch-tasks:stop-task",
	DELETE_TASK: "origin:batch-tasks:delete-task",
	BATCH_DELETE: "origin:batch-tasks:batch-delete",
	BATCH_START: "origin:batch-tasks:batch-start",
	BATCH_STOP: "origin:batch-tasks:batch-stop",
	BATCH_RESET: "origin:batch-tasks:batch-reset",
	BATCH_RESET_FAILED: "origin:batch-tasks:batch-reset-failed",
	DELETE_SESSION: "origin:batch-tasks:delete-session",
	RESUME_TASK: "origin:batch-tasks:resume-task",
	RESUME_TASK_WITH_TEXT: "origin:batch-tasks:resume-task-with-text",
	EVENT: "origin:batch-tasks:event",
} as const;

export function createBatchTasksApi(ipc: IpcRenderer): Pick<DesktopApi, "batchTasks"> {
	return {
		batchTasks: {
			getProjects: () => ipc.invoke(BATCH_TASKS_CHANNELS.GET_PROJECTS),
			createProject: (data) => ipc.invoke(BATCH_TASKS_CHANNELS.CREATE_PROJECT, data),
			updateProject: (projectId, data) => ipc.invoke(BATCH_TASKS_CHANNELS.UPDATE_PROJECT, projectId, data),
			deleteProject: (projectId) => ipc.invoke(BATCH_TASKS_CHANNELS.DELETE_PROJECT, projectId),
			runTask: (projectId, taskId) => ipc.invoke(BATCH_TASKS_CHANNELS.RUN_TASK, projectId, taskId),
			retryTask: (projectId, taskId) => ipc.invoke(BATCH_TASKS_CHANNELS.RETRY_TASK, projectId, taskId),
			stopTask: (projectId, taskId) => ipc.invoke(BATCH_TASKS_CHANNELS.STOP_TASK, projectId, taskId),
			deleteTask: (projectId, taskId) => ipc.invoke(BATCH_TASKS_CHANNELS.DELETE_TASK, projectId, taskId),
			batchDelete: (projectId) => ipc.invoke(BATCH_TASKS_CHANNELS.BATCH_DELETE, projectId),
			batchStart: (projectId) => ipc.invoke(BATCH_TASKS_CHANNELS.BATCH_START, projectId),
			batchStop: (projectId) => ipc.invoke(BATCH_TASKS_CHANNELS.BATCH_STOP, projectId),
			batchReset: (projectId) => ipc.invoke(BATCH_TASKS_CHANNELS.BATCH_RESET, projectId),
			batchResetFailed: (projectId, taskIds) =>
				ipc.invoke(BATCH_TASKS_CHANNELS.BATCH_RESET_FAILED, projectId, taskIds),
			deleteSession: (sessionPath) => ipc.invoke(BATCH_TASKS_CHANNELS.DELETE_SESSION, sessionPath),
			resumeTask: (projectId, taskId) => ipc.invoke(BATCH_TASKS_CHANNELS.RESUME_TASK, projectId, taskId),
			resumeTaskWithText: (projectId, taskId, text) =>
				ipc.invoke(BATCH_TASKS_CHANNELS.RESUME_TASK_WITH_TEXT, projectId, taskId, text),
			onTaskEvent: (handler) => onIpcEvent(ipc, BATCH_TASKS_CHANNELS.EVENT, handler),
		},
	};
}
