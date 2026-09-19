export interface PluginRecordingStartRequest {
	readonly projectKey: string;
	readonly sessionId: string;
	readonly url: string;
	readonly width?: number;
	readonly height?: number;
	readonly fps?: number;
	readonly codec?: "h264" | "av1";
	readonly retention?: "30m" | "2h" | "until-cleared";
	readonly cwd?: string;
}

export interface PluginRecordingVideo {
	readonly path: string;
	readonly mimeType: string;
	readonly codec: "h264" | "av1";
	readonly width: number;
	readonly height: number;
	readonly fps: number;
	readonly sizeBytes: number;
}

export interface PluginRecordingRecord {
	readonly id: string;
	readonly projectKey: string;
	readonly sessionId: string;
	readonly startedAt: number;
	readonly endedAt?: number;
	readonly durationMs?: number;
	readonly video?: PluginRecordingVideo;
	readonly audio: "none" | "opus-muxed";
	readonly frames: readonly { readonly atMs: number; readonly path: string }[];
	readonly telemetryPath: string;
	readonly inputPath: string;
	readonly retention: "30m" | "2h" | "until-cleared";
	readonly expiresAt?: number;
	readonly status: "recording" | "finalizing" | "ready" | "failed";
	readonly error?: string;
}

export interface PluginRecordingSampleRequest {
	readonly recordingId: string;
	readonly atMs?: readonly number[];
	readonly everyMs?: number;
	readonly contactSheet?: { readonly columns: number };
}

export interface PluginRecordingSampleResult {
	readonly recordingId: string;
	readonly frames: readonly { readonly atMs: number; readonly path: string }[];
	readonly contactSheetPath?: string;
}

export interface PluginRecordingListQuery {
	readonly projectKey?: string;
	readonly sessionId?: string;
	readonly includeExpired?: boolean;
}

/**
 * Host webpage recording. Requires `recording:capture`. Older hosts omit this
 * API; plugins must null-check `ctx.recording` before use.
 */
export interface PluginRecordingApi {
	start(request: PluginRecordingStartRequest): Promise<PluginRecordingRecord>;
	stop(recordingId: string): Promise<PluginRecordingRecord>;
	cancel(recordingId: string): Promise<PluginRecordingRecord>;
	list(query?: PluginRecordingListQuery): Promise<readonly PluginRecordingRecord[]>;
	read(recordingId: string): Promise<PluginRecordingRecord>;
	sample(request: PluginRecordingSampleRequest): Promise<PluginRecordingSampleResult>;
	clear(recordingId: string): Promise<void>;
	probe(
		recordingId: string,
		kind: "tick" | "state" | "advance" | "input" | "pick" | "read_entity" | "patch_entity",
		payload?: unknown,
	): Promise<unknown>;
}
