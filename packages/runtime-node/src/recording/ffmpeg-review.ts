import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

export interface TranscodeRecordingForReviewOptions {
	readonly ffmpegPath: string;
	readonly inputPath: string;
	readonly outputPath: string;
	readonly maxBytes: number;
}

export interface TranscodeRecordingForReviewResult {
	readonly path: string;
	readonly bytes: number;
	readonly transcoded: boolean;
}

/**
 * Keep a review payload under the 128 MiB budget. Unchanged files that already
 * fit are returned as-is; oversized clips are re-encoded at half resolution
 * and CRF 32 before the caller may still refuse them.
 */
export async function transcodeRecordingForReview(
	options: TranscodeRecordingForReviewOptions,
): Promise<TranscodeRecordingForReviewResult> {
	const bytes = (await stat(options.inputPath)).size;
	if (bytes <= options.maxBytes) {
		return { path: options.inputPath, bytes, transcoded: false };
	}
	await runFfmpeg(options.ffmpegPath, [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-i",
		options.inputPath,
		"-vf",
		"scale=trunc(iw/2/2)*2:trunc(ih/2/2)*2",
		"-c:v",
		"libx264",
		"-preset",
		"veryfast",
		"-crf",
		"32",
		"-c:a",
		"aac",
		"-movflags",
		"+faststart",
		options.outputPath,
	]);
	const transcodedBytes = (await stat(options.outputPath)).size;
	if (transcodedBytes > options.maxBytes) {
		throw new Error(
			`Recording still exceeds the ${options.maxBytes} byte review budget after transcode (${transcodedBytes} bytes). Sample frames with recording_sample instead.`,
		);
	}
	return { path: options.outputPath, bytes: transcodedBytes, transcoded: true };
}

function runFfmpeg(ffmpegPath: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg review transcode exited ${code}: ${stderr.trim()}`));
		});
	});
}
