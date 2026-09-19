import type {
	RecordingListQuery,
	RecordingRecord,
	RecordingSampleRequest,
	RecordingSampleResult,
	RecordingStartRequest,
} from "@origin/runtime-recording";

export interface DesktopRecordingApi {
	start(request: RecordingStartRequest): Promise<RecordingRecord>;
	stop(recordingId: string): Promise<RecordingRecord>;
	cancel(recordingId: string): Promise<RecordingRecord>;
	list(query?: RecordingListQuery): Promise<readonly RecordingRecord[]>;
	read(recordingId: string): Promise<RecordingRecord>;
	sample(request: RecordingSampleRequest): Promise<RecordingSampleResult>;
	clear(recordingId: string): Promise<void>;
	probe(
		recordingId: string,
		kind: "tick" | "state" | "advance" | "input" | "pick" | "read_entity" | "patch_entity",
		payload?: unknown,
	): Promise<unknown>;
}
