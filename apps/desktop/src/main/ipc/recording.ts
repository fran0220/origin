import { join } from "node:path";
import type {
	RecordingListQuery,
	RecordingRecord,
	RecordingSampleRequest,
	RecordingStartRequest,
} from "@origin/runtime-recording";
import { ipcMain } from "electron";
import { getDesktopRecordingEngine, recordingsRoot } from "../recording/recording-engine.js";

export const RECORDING_CHANNELS = {
	START: "origin:recording:start",
	STOP: "origin:recording:stop",
	CANCEL: "origin:recording:cancel",
	LIST: "origin:recording:list",
	READ: "origin:recording:read",
	SAMPLE: "origin:recording:sample",
	CLEAR: "origin:recording:clear",
	PROBE: "origin:recording:probe",
} as const;

function requireString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid ${label}`);
	return value;
}

function absoluteMediaPath(directory: string, path: string): string {
	return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) ? path : join(directory, path);
}

function withAbsoluteMedia(record: RecordingRecord): RecordingRecord {
	const directory = join(recordingsRoot(), record.projectKey, record.id);
	return {
		...record,
		video: record.video
			? {
					...record.video,
					path: absoluteMediaPath(directory, record.video.path),
				}
			: record.video,
		frames: record.frames.map((frame) => ({
			...frame,
			path: absoluteMediaPath(directory, frame.path),
		})),
	};
}

export function registerRecordingIpc(): () => void {
	const engine = getDesktopRecordingEngine();

	ipcMain.handle(RECORDING_CHANNELS.START, async (_event, request: unknown) => {
		if (!request || typeof request !== "object") throw new Error("Invalid recording start request");
		return withAbsoluteMedia(await engine.start(request as RecordingStartRequest));
	});
	ipcMain.handle(RECORDING_CHANNELS.STOP, async (_event, recordingId: unknown) =>
		withAbsoluteMedia(await engine.stop(requireString(recordingId, "recordingId"))),
	);
	ipcMain.handle(RECORDING_CHANNELS.CANCEL, async (_event, recordingId: unknown) =>
		withAbsoluteMedia(await engine.cancel(requireString(recordingId, "recordingId"))),
	);
	ipcMain.handle(RECORDING_CHANNELS.LIST, async (_event, query: unknown) =>
		(await engine.list(query as RecordingListQuery | undefined)).map(withAbsoluteMedia),
	);
	ipcMain.handle(RECORDING_CHANNELS.READ, async (_event, recordingId: unknown) =>
		withAbsoluteMedia(await engine.read(requireString(recordingId, "recordingId"))),
	);
	ipcMain.handle(RECORDING_CHANNELS.SAMPLE, async (_event, request: unknown) => {
		if (!request || typeof request !== "object") throw new Error("Invalid recording sample request");
		const sample = await engine.sample(request as RecordingSampleRequest);
		const record = await engine.read(sample.recordingId);
		const directory = join(recordingsRoot(), record.projectKey, record.id);
		return {
			...sample,
			frames: sample.frames.map((frame) => ({
				...frame,
				path: absoluteMediaPath(directory, frame.path),
			})),
			contactSheetPath: sample.contactSheetPath
				? absoluteMediaPath(directory, sample.contactSheetPath)
				: sample.contactSheetPath,
		};
	});
	ipcMain.handle(RECORDING_CHANNELS.CLEAR, (_event, recordingId: unknown) =>
		engine.clear(requireString(recordingId, "recordingId")),
	);
	ipcMain.handle(RECORDING_CHANNELS.PROBE, (_event, recordingId: unknown, kind: unknown, payload: unknown) => {
		if (
			kind !== "tick" &&
			kind !== "state" &&
			kind !== "advance" &&
			kind !== "input" &&
			kind !== "pick" &&
			kind !== "read_entity" &&
			kind !== "patch_entity"
		) {
			throw new Error("Invalid probe kind");
		}
		return engine.probe(requireString(recordingId, "recordingId"), kind, payload);
	});

	return () => {
		for (const channel of Object.values(RECORDING_CHANNELS)) ipcMain.removeHandler(channel);
	};
}
