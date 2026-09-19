import type { RecordingRecord, RecordingStatus } from "./schema.js";

export const RECORDING_TRANSITIONS: Readonly<Record<RecordingStatus, readonly RecordingStatus[]>> = {
	recording: ["finalizing", "failed"],
	finalizing: ["ready", "failed"],
	ready: [],
	failed: [],
};

export class RecordingStateError extends Error {
	readonly from: RecordingStatus;
	readonly to: RecordingStatus;

	constructor(from: RecordingStatus, to: RecordingStatus) {
		super(`Recording cannot transition from ${from} to ${to}`);
		this.name = "RecordingStateError";
		this.from = from;
		this.to = to;
	}
}

export function canTransitionRecording(from: RecordingStatus, to: RecordingStatus): boolean {
	return RECORDING_TRANSITIONS[from].includes(to);
}

export function assertRecordingTransition(from: RecordingStatus, to: RecordingStatus): void {
	if (!canTransitionRecording(from, to)) throw new RecordingStateError(from, to);
}

export function transitionRecording(
	record: RecordingRecord,
	to: RecordingStatus,
	patch: Partial<Omit<RecordingRecord, "id" | "projectKey" | "sessionId" | "startedAt" | "status">> = {},
): RecordingRecord {
	assertRecordingTransition(record.status, to);
	return { ...record, ...patch, status: to };
}

export function isTerminalRecordingStatus(status: RecordingStatus): boolean {
	return status === "ready" || status === "failed";
}

export function isActiveRecordingStatus(status: RecordingStatus): boolean {
	return status === "recording" || status === "finalizing";
}
