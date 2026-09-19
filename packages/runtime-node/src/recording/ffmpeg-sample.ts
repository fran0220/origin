import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { RecordingSampleRequest, RecordingSampleResult } from "@origin/runtime-recording";

export interface FfmpegSampleOptions {
	readonly ffmpegPath: string;
	readonly videoPath: string;
	readonly outputDirectory: string;
	readonly durationMs: number;
	readonly request: RecordingSampleRequest;
	readonly width?: number;
	readonly height?: number;
}

export async function sampleRecordingWithFfmpeg(options: FfmpegSampleOptions): Promise<RecordingSampleResult> {
	const timestamps = resolveSampleTimestamps(options.request, options.durationMs);
	if (timestamps.length === 0) {
		throw new Error("recording sample requires atMs or everyMs");
	}
	await mkdir(options.outputDirectory, { recursive: true });
	const frames: { atMs: number; path: string }[] = [];
	for (const [index, atMs] of timestamps.entries()) {
		const path = join(options.outputDirectory, `frame-${String(index).padStart(4, "0")}-${atMs}.png`);
		await runFfmpeg(options.ffmpegPath, [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-ss",
			formatTimestamp(atMs),
			"-i",
			options.videoPath,
			"-frames:v",
			"1",
			path,
		]);
		frames.push({ atMs, path });
	}

	let contactSheetPath: string | undefined;
	const columns = options.request.contactSheet?.columns;
	if (columns && columns > 0 && frames.length > 0) {
		contactSheetPath = join(options.outputDirectory, "contact-sheet.png");
		const tile = `${columns}x${Math.ceil(frames.length / columns)}`;
		await runFfmpeg(options.ffmpegPath, [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			...frames.flatMap((frame) => ["-i", frame.path]),
			"-filter_complex",
			`tile=${tile}`,
			contactSheetPath,
		]);
	}

	return { recordingId: options.request.recordingId, frames, contactSheetPath };
}

export function resolveSampleTimestamps(request: RecordingSampleRequest, durationMs: number): number[] {
	if (request.atMs && request.atMs.length > 0) {
		return [...request.atMs].map((value) => Math.max(0, Math.min(durationMs, Math.round(value))));
	}
	if (request.everyMs && request.everyMs > 0) {
		const stamps: number[] = [];
		for (let at = 0; at <= durationMs; at += request.everyMs) stamps.push(at);
		if (stamps[stamps.length - 1] !== durationMs && durationMs > 0) stamps.push(durationMs);
		return stamps;
	}
	return [];
}

export function formatTimestamp(atMs: number): string {
	const totalSeconds = atMs / 1000;
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
}

export async function probeVideoDurationMs(ffprobePath: string, videoPath: string): Promise<number> {
	const stdout = await runCommand(ffprobePath, [
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"default=noprint_wrappers=1:nokey=1",
		videoPath,
	]);
	const seconds = Number.parseFloat(stdout.trim());
	if (!Number.isFinite(seconds) || seconds < 0) return 0;
	return Math.round(seconds * 1000);
}

export async function fileSizeBytes(path: string): Promise<number> {
	return (await stat(path)).size;
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
	return runCommand(ffmpegPath, args).then(() => undefined);
}

function runCommand(executable: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) resolve(stdout);
			else reject(new Error(`${executable} exited ${code}: ${stderr.trim()}`));
		});
	});
}

export function contactSheetExpectedSize(
	frameCount: number,
	columns: number,
	frameWidth: number,
	frameHeight: number,
): { width: number; height: number } {
	const rows = Math.ceil(frameCount / columns);
	return { width: columns * frameWidth, height: rows * frameHeight };
}
