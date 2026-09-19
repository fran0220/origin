import type { RecordingRecord, RecordingRetention } from "./schema.js";

export const RECORDING_RETENTION_MS = {
	"30m": 30 * 60 * 1000,
	"2h": 2 * 60 * 60 * 1000,
} as const;

export type RecordingClock = () => number;

export function computeRecordingExpiresAt(startedAt: number, retention: RecordingRetention): number | undefined {
	if (retention === "until-cleared") return undefined;
	return startedAt + RECORDING_RETENTION_MS[retention];
}

export function isRecordingExpired(record: RecordingRecord, nowMs: number): boolean {
	if (record.retention === "until-cleared") return false;
	const expiresAt = record.expiresAt ?? computeRecordingExpiresAt(record.startedAt, record.retention);
	if (expiresAt === undefined) return false;
	return nowMs >= expiresAt;
}

export function applyRecordingRetention(record: RecordingRecord): RecordingRecord {
	return {
		...record,
		expiresAt: computeRecordingExpiresAt(record.startedAt, record.retention),
	};
}

export function selectExpiredRecordings(records: readonly RecordingRecord[], nowMs: number): RecordingRecord[] {
	return records.filter((record) => isRecordingExpired(record, nowMs));
}
