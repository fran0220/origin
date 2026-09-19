import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { FrameEncoder, FrameEncoderStartOptions, FrameEncoderStats, FramePixels } from "@vetta/runtime-recording";

const DEFAULT_MAX_QUEUED_FRAMES = 30;

export interface FfmpegFrameEncoderOptions {
	readonly ffmpegPath: string;
	readonly silentAac?: boolean;
}

/**
 * Encodes RGBA8888 frames via ffmpeg stdin rawvideo into H.264 (or AV1) MP4.
 * Backpressure: when the in-flight stdin queue exceeds `maxQueuedFrames`, the
 * newest frame is dropped and counted rather than blocking capture.
 */
export class FfmpegFrameEncoder implements FrameEncoder {
	private process: ChildProcessWithoutNullStreams | undefined;
	private options: FrameEncoderStartOptions | undefined;
	private acceptedFrames = 0;
	private droppedFrames = 0;
	private queued = 0;
	private firstAtMs: number | undefined;
	private lastAtMs: number | undefined;
	private stderr = "";
	private stdinEnded = false;
	private exitPromise: Promise<void> | undefined;

	constructor(private readonly config: FfmpegFrameEncoderOptions) {}

	async start(options: FrameEncoderStartOptions): Promise<void> {
		if (this.process) throw new Error("Frame encoder already started");
		this.options = options;
		this.acceptedFrames = 0;
		this.droppedFrames = 0;
		this.queued = 0;
		this.firstAtMs = undefined;
		this.lastAtMs = undefined;
		this.stderr = "";
		this.stdinEnded = false;
		await mkdir(dirname(options.outputPath), { recursive: true });

		const args = buildFfmpegEncodeArgs(options, this.config.silentAac !== false);
		const child = spawn(this.config.ffmpegPath, args, { stdio: ["pipe", "pipe", "pipe"] });
		this.process = child;
		child.stdout.resume();
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			this.stderr += chunk;
			if (this.stderr.length > 16_384) this.stderr = this.stderr.slice(-8_192);
		});
		this.exitPromise = new Promise<void>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", (code, signal) => {
				if (code === 0 || this.stdinEnded) resolve();
				else reject(new Error(`ffmpeg exited ${code ?? signal}: ${this.stderr.trim()}`));
			});
		});
	}

	async push(frame: FramePixels): Promise<{ readonly dropped: boolean }> {
		const options = this.requireOptions();
		const child = this.requireProcess();
		const expected = options.width * options.height * 4;
		if (frame.rgba.byteLength !== expected) {
			throw new Error(`RGBA frame size ${frame.rgba.byteLength} !== ${expected}`);
		}
		const maxQueued = options.maxQueuedFrames ?? DEFAULT_MAX_QUEUED_FRAMES;
		if (this.queued >= maxQueued || child.stdin.destroyed || !child.stdin.writable) {
			this.droppedFrames += 1;
			return { dropped: true };
		}
		this.queued += 1;
		this.acceptedFrames += 1;
		this.firstAtMs ??= frame.atMs;
		this.lastAtMs = frame.atMs;
		const ok = child.stdin.write(frame.rgba, (error) => {
			this.queued = Math.max(0, this.queued - 1);
			if (error) this.droppedFrames += 1;
		});
		if (!ok) {
			// High-water: still accepted into Node's buffer, but further frames drop until drain.
			await new Promise<void>((resolve) => child.stdin.once("drain", resolve));
		}
		return { dropped: false };
	}

	async finish(): Promise<FrameEncoderStats> {
		const options = this.requireOptions();
		const child = this.requireProcess();
		this.stdinEnded = true;
		if (child.stdin.writable) child.stdin.end();
		await this.exitPromise;
		const sizeBytes = (await stat(options.outputPath)).size;
		const durationMs =
			this.firstAtMs === undefined || this.lastAtMs === undefined
				? 0
				: Math.max(0, this.lastAtMs - this.firstAtMs + Math.round(1000 / options.fps));
		this.process = undefined;
		return {
			acceptedFrames: this.acceptedFrames,
			droppedFrames: this.droppedFrames,
			durationMs,
			sizeBytes,
		};
	}

	async abort(): Promise<void> {
		const child = this.process;
		this.process = undefined;
		if (!child) return;
		child.stdin.destroy();
		child.kill("SIGKILL");
	}

	private requireOptions(): FrameEncoderStartOptions {
		if (!this.options) throw new Error("Frame encoder is not started");
		return this.options;
	}

	private requireProcess(): ChildProcessWithoutNullStreams {
		if (!this.process) throw new Error("Frame encoder is not started");
		return this.process;
	}
}

export function buildFfmpegEncodeArgs(options: FrameEncoderStartOptions, silentAac: boolean): string[] {
	const videoCodec =
		options.codec === "av1"
			? ["-c:v", "libaom-av1", "-crf", "32", "-cpu-used", "6"]
			: ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"];
	const args = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-f",
		"rawvideo",
		"-pix_fmt",
		"rgba",
		"-s",
		`${options.width}x${options.height}`,
		"-r",
		String(options.fps),
		"-i",
		"pipe:0",
	];
	if (options.audioPath) {
		args.push("-i", options.audioPath);
	} else if (silentAac) {
		args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
	}
	args.push(...videoCodec, "-c:a", "aac", "-shortest", "-movflags", "+faststart", options.outputPath);
	return args;
}

export async function writeRgbaFramesToFile(path: string, frames: readonly FramePixels[]): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await new Promise<void>((resolve, reject) => {
		const stream = createWriteStream(path);
		stream.on("error", reject);
		stream.on("finish", resolve);
		for (const frame of frames) stream.write(frame.rgba);
		stream.end();
	});
}
