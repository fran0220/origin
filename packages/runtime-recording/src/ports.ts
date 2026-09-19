import type { RecordingRecord, RecordingRetention, RecordingVideoCodec } from "./schema.js";

export interface RecordingStartRequest {
	readonly projectKey: string;
	readonly sessionId: string;
	readonly url: string;
	readonly width?: number;
	readonly height?: number;
	readonly fps?: number;
	readonly codec?: RecordingVideoCodec;
	readonly retention?: RecordingRetention;
	readonly cwd?: string;
}

export interface RecordingSampleRequest {
	readonly recordingId: string;
	readonly atMs?: readonly number[];
	readonly everyMs?: number;
	readonly contactSheet?: { readonly columns: number };
}

export interface RecordingSampleResult {
	readonly recordingId: string;
	readonly frames: readonly { readonly atMs: number; readonly path: string }[];
	readonly contactSheetPath?: string;
}

export interface RecordingListQuery {
	readonly projectKey?: string;
	readonly sessionId?: string;
	readonly includeExpired?: boolean;
}

export interface RecordingEngine {
	start(request: RecordingStartRequest): Promise<RecordingRecord>;
	stop(recordingId: string): Promise<RecordingRecord>;
	cancel(recordingId: string): Promise<RecordingRecord>;
	list(query?: RecordingListQuery): Promise<readonly RecordingRecord[]>;
	read(recordingId: string): Promise<RecordingRecord>;
	sample(request: RecordingSampleRequest): Promise<RecordingSampleResult>;
	clear(recordingId: string): Promise<void>;
	sweepExpired(nowMs?: number): Promise<readonly string[]>;
}

export interface FramePixels {
	readonly atMs: number;
	readonly width: number;
	readonly height: number;
	/** Packed RGBA8888, row-major, `width * height * 4` bytes. */
	readonly rgba: Uint8Array;
}

export interface FrameEncoderStartOptions {
	readonly outputPath: string;
	readonly width: number;
	readonly height: number;
	readonly fps: number;
	readonly codec: RecordingVideoCodec;
	readonly audioPath?: string;
	readonly maxQueuedFrames?: number;
}

export interface FrameEncoderStats {
	readonly acceptedFrames: number;
	readonly droppedFrames: number;
	readonly durationMs: number;
	readonly sizeBytes: number;
}

export interface FrameEncoder {
	start(options: FrameEncoderStartOptions): Promise<void>;
	/**
	 * Enqueue one frame. Implementations must drop when the queue is full and
	 * count the drop rather than blocking the capture loop indefinitely.
	 */
	push(frame: FramePixels): Promise<{ readonly dropped: boolean }>;
	finish(): Promise<FrameEncoderStats>;
	abort(): Promise<void>;
}

export interface RecordingStore {
	put(record: RecordingRecord): Promise<void>;
	get(recordingId: string): Promise<RecordingRecord | undefined>;
	list(query?: RecordingListQuery): Promise<readonly RecordingRecord[]>;
	delete(recordingId: string): Promise<void>;
	directoryFor(record: RecordingRecord): string;
}
