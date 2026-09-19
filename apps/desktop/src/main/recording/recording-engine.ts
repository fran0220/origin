import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	FfmpegFrameEncoder,
	FileRecordingStore,
	fileSizeBytes,
	muxOpusAudioIntoMp4,
	probeVideoDurationMs,
	sampleRecordingWithFfmpeg,
} from "@vetta/runtime-node/recording";
import {
	applyRecordingRetention,
	parseRecordingRecord,
	type RecordingEngine,
	type RecordingListQuery,
	type RecordingRecord,
	type RecordingSampleRequest,
	type RecordingSampleResult,
	type RecordingStartRequest,
	transitionRecording,
} from "@vetta/runtime-recording";
import { BrowserWindow, ipcMain } from "electron";
import { readDesktopConfig } from "../config/desktop-config-store.js";
import { resolveAccountScopedDirForHost } from "../connections/account-directory.js";
import { getAppLogger } from "../logger.js";
import { getRuntimeManager } from "../runtimes/manager.js";
import { bgraToRgba } from "./bgra.js";
import { appendJsonl, executeAndPersistProbe, RECORDING_PROBE_SCRIPT } from "./probe.js";
import { resolveRecordingTargetUrl } from "./url-policy.js";

const log = getAppLogger("recording");
const AUDIO_CHANNEL = "vetta:recording:audio";
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const DEFAULT_FPS = 30;

interface ActiveCapture {
	readonly id: string;
	readonly window: BrowserWindow;
	readonly encoder: FfmpegFrameEncoder;
	readonly startedAt: number;
	readonly originMs: number;
	readonly directory: string;
	readonly videoPath: string;
	readonly audioPath: string;
	readonly telemetryPath: string;
	readonly inputPath: string;
	readonly width: number;
	readonly height: number;
	readonly fps: number;
	readonly codec: "h264" | "av1";
	audioChunks: Buffer[];
	audioStarted: boolean;
	droppedFrames: number;
}

const captures = new Map<string, ActiveCapture>();
let store: FileRecordingStore | undefined;
let storeRoot: string | undefined;
let initialized = false;

export function recordingsRoot(): string {
	return resolveAccountScopedDirForHost("recordings");
}

function getStore(): FileRecordingStore {
	const root = recordingsRoot();
	if (!store || storeRoot !== root) {
		store = new FileRecordingStore({ rootDirectory: root });
		storeRoot = root;
	}
	return store;
}

export async function initializeDesktopRecording(): Promise<void> {
	if (initialized) return;
	initialized = true;
	ipcMain.on(AUDIO_CHANNEL, (_event, payload: unknown) => {
		handleAudioIpc(payload);
	});
	try {
		await getStore().sweepExpired();
	} catch (error) {
		log.warn("recording startup sweep failed", { error: error instanceof Error ? error.message : String(error) });
	}
}

function handleAudioIpc(payload: unknown): void {
	if (!payload || typeof payload !== "object") return;
	const record = payload as { type?: unknown; data?: unknown; recordingId?: unknown };
	const capture =
		typeof record.recordingId === "string"
			? captures.get(record.recordingId)
			: [...captures.values()][captures.size - 1];
	if (!capture) return;
	if (record.type === "start") {
		capture.audioStarted = true;
		return;
	}
	if (record.type === "chunk" && Array.isArray(record.data)) {
		capture.audioChunks.push(Buffer.from(record.data as number[]));
	}
}

function resolveFfmpeg(): { ffmpeg: string; ffprobe: string } {
	const manager = getRuntimeManager();
	try {
		return { ffmpeg: manager.getExecutable("ffmpeg"), ffprobe: manager.getFfprobeExecutable() };
	} catch {
		return { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
	}
}

export class DesktopRecordingEngine implements RecordingEngine {
	async start(request: RecordingStartRequest): Promise<RecordingRecord> {
		await initializeDesktopRecording();
		const config = await readDesktopConfig();
		const url = resolveRecordingTargetUrl(request.url, request.cwd);
		const width = request.width ?? DEFAULT_WIDTH;
		const height = request.height ?? DEFAULT_HEIGHT;
		const fps = request.fps ?? DEFAULT_FPS;
		const codec = request.codec ?? "h264";
		const retention = request.retention ?? config.recording?.defaultRetention ?? "2h";
		const id = `rec_${randomUUID()}`;
		const startedAt = Date.now();
		const record = applyRecordingRetention(
			parseRecordingRecord({
				recordType: "recording.record",
				schemaVersion: 1,
				id,
				projectKey: request.projectKey,
				sessionId: request.sessionId,
				startedAt,
				audio: "none",
				frames: [],
				telemetryPath: "telemetry.jsonl",
				inputPath: "input.jsonl",
				retention,
				status: "recording",
			}),
		);
		const directory = getStore().directoryFor(record);
		await mkdir(directory, { recursive: true });
		const videoPath = join(directory, "video.mp4");
		const audioPath = join(directory, "audio.webm");
		const telemetryPath = join(directory, "telemetry.jsonl");
		const inputPath = join(directory, "input.jsonl");
		await writeFile(telemetryPath, "");
		await writeFile(inputPath, "");

		const { ffmpeg } = resolveFfmpeg();
		const encoder = new FfmpegFrameEncoder({ ffmpegPath: ffmpeg });
		await encoder.start({ outputPath: videoPath, width, height, fps, codec, maxQueuedFrames: fps });

		const preloadPath = fileURLToPath(new URL("./audio-preload.js", import.meta.url));
		const window = new BrowserWindow({
			show: false,
			frame: false,
			width,
			height,
			useContentSize: true,
			webPreferences: {
				sandbox: true,
				contextIsolation: true,
				nodeIntegration: false,
				offscreen: true,
				backgroundThrottling: false,
				preload: preloadPath,
			},
		});
		window.webContents.setFrameRate(fps);
		const originMs = Date.now();
		const capture: ActiveCapture = {
			id,
			window,
			encoder,
			startedAt,
			originMs,
			directory,
			videoPath,
			audioPath,
			telemetryPath,
			inputPath,
			width,
			height,
			fps,
			codec,
			audioChunks: [],
			audioStarted: false,
			droppedFrames: 0,
		};
		captures.set(id, capture);

		window.webContents.on("paint", (_event, _dirty, image) => {
			const size = image.getSize();
			const rgba = bgraToRgba(new Uint8Array(image.toBitmap()));
			void encoder
				.push({
					atMs: Date.now() - originMs,
					width: size.width,
					height: size.height,
					rgba,
				})
				.then(async (result) => {
					if (!result.dropped) return;
					capture.droppedFrames += 1;
					await appendJsonl(telemetryPath, {
						atMs: Date.now() - originMs,
						kind: "dropped_frame",
						payload: { droppedFrames: capture.droppedFrames },
					});
				})
				.catch((error: unknown) => {
					log.warn("recording frame push failed", {
						error: error instanceof Error ? error.message : String(error),
					});
				});
		});

		await window.loadURL(url);
		await window.webContents
			.executeJavaScript(
				`window.__vettaRecordingAudio && window.__vettaRecordingAudio.setRecordingId(${JSON.stringify(id)}); true`,
				true,
			)
			.catch(() => undefined);
		await window.webContents.executeJavaScript(RECORDING_PROBE_SCRIPT, true).catch(() => undefined);
		await getStore().put(record);
		return record;
	}

	async stop(recordingId: string): Promise<RecordingRecord> {
		const capture = captures.get(recordingId);
		const current = await this.read(recordingId);
		if (!capture) {
			if (current.status === "ready") return current;
			throw new Error(`Recording ${recordingId} is not active`);
		}
		const finalizing = transitionRecording(current, "finalizing");
		await getStore().put(finalizing);
		try {
			await capture.window.webContents.executeJavaScript(
				`window.dispatchEvent(new Event("vetta-recording-stop-audio")); true`,
				true,
			);
			await new Promise((resolve) => setTimeout(resolve, 200));
			if (!capture.window.isDestroyed()) capture.window.destroy();
			const stats = await capture.encoder.finish();
			let audio: RecordingRecord["audio"] = "none";
			let videoPath = capture.videoPath;
			if (capture.audioChunks.length > 0) {
				await writeFile(capture.audioPath, Buffer.concat(capture.audioChunks));
				const muxedPath = join(capture.directory, "video-muxed.mp4");
				const { ffmpeg } = resolveFfmpeg();
				await muxOpusAudioIntoMp4({
					ffmpegPath: ffmpeg,
					videoPath: capture.videoPath,
					audioPath: capture.audioPath,
					outputPath: muxedPath,
				});
				await rm(capture.videoPath, { force: true });
				await rename(muxedPath, capture.videoPath);
				audio = "opus-muxed";
				videoPath = capture.videoPath;
			}
			const { ffprobe } = resolveFfmpeg();
			const probedDuration = await probeVideoDurationMs(ffprobe, videoPath);
			const endedAt = Date.now();
			const ready = transitionRecording(finalizing, "ready", {
				endedAt,
				durationMs: probedDuration || stats.durationMs,
				audio,
				droppedFrames: capture.droppedFrames + stats.droppedFrames,
				video: {
					path: "video.mp4",
					mimeType: "video/mp4",
					codec: capture.codec,
					width: capture.width,
					height: capture.height,
					fps: capture.fps,
					sizeBytes: await fileSizeBytes(videoPath),
				},
			});
			captures.delete(recordingId);
			await getStore().put(ready);
			return ready;
		} catch (error) {
			captures.delete(recordingId);
			const failed = transitionRecording(finalizing, "failed", {
				error: error instanceof Error ? error.message : String(error),
				endedAt: Date.now(),
			});
			await getStore().put(failed);
			return failed;
		}
	}

	async cancel(recordingId: string): Promise<RecordingRecord> {
		const capture = captures.get(recordingId);
		const current = await this.read(recordingId);
		if (capture) {
			await capture.encoder.abort().catch(() => undefined);
			if (!capture.window.isDestroyed()) capture.window.destroy();
			captures.delete(recordingId);
		}
		if (current.status === "failed") return current;
		if (current.status === "ready") {
			throw new Error(`Recording ${recordingId} has already finished`);
		}
		const failed = transitionRecording(current, "failed", { error: "cancelled", endedAt: Date.now() });
		await getStore().put(failed);
		return failed;
	}

	async list(query?: RecordingListQuery): Promise<readonly RecordingRecord[]> {
		await initializeDesktopRecording();
		return getStore().list(query);
	}

	async read(recordingId: string): Promise<RecordingRecord> {
		await initializeDesktopRecording();
		const record = await getStore().get(recordingId);
		if (!record) throw new Error(`Recording not found: ${recordingId}`);
		return record;
	}

	async sample(request: RecordingSampleRequest): Promise<RecordingSampleResult> {
		const record = await this.read(request.recordingId);
		if (record.status !== "ready" || !record.video) throw new Error("Recording is not ready to sample");
		const directory = getStore().directoryFor(record);
		const { ffmpeg } = resolveFfmpeg();
		return sampleRecordingWithFfmpeg({
			ffmpegPath: ffmpeg,
			videoPath: join(directory, record.video.path),
			outputDirectory: join(directory, "frames"),
			durationMs: record.durationMs ?? 0,
			request,
			width: record.video.width,
			height: record.video.height,
		});
	}

	async clear(recordingId: string): Promise<void> {
		const capture = captures.get(recordingId);
		if (capture) {
			await capture.encoder.abort().catch(() => undefined);
			if (!capture.window.isDestroyed()) capture.window.destroy();
			captures.delete(recordingId);
		}
		await getStore().delete(recordingId);
	}

	async sweepExpired(nowMs?: number): Promise<readonly string[]> {
		await initializeDesktopRecording();
		return getStore().sweepExpired(nowMs);
	}

	async probe(
		recordingId: string,
		kind: "tick" | "state" | "advance" | "input" | "pick" | "read_entity" | "patch_entity",
		payload?: unknown,
	): Promise<unknown> {
		const capture = captures.get(recordingId);
		if (!capture) throw new Error(`Recording ${recordingId} is not active`);
		return executeAndPersistProbe(capture.window.webContents, capture, kind, payload);
	}
}

let engine: DesktopRecordingEngine | undefined;

export function getDesktopRecordingEngine(): DesktopRecordingEngine {
	engine ??= new DesktopRecordingEngine();
	return engine;
}

export function setDesktopRecordingEngineForTests(value: DesktopRecordingEngine | undefined): void {
	engine = value;
}
