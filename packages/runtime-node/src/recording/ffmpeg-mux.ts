import { spawn } from "node:child_process";

export async function muxOpusAudioIntoMp4(options: {
	readonly ffmpegPath: string;
	readonly videoPath: string;
	readonly audioPath: string;
	readonly outputPath: string;
}): Promise<void> {
	await runFfmpeg(options.ffmpegPath, [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-i",
		options.videoPath,
		"-i",
		options.audioPath,
		"-c:v",
		"copy",
		"-c:a",
		"aac",
		"-shortest",
		"-movflags",
		"+faststart",
		options.outputPath,
	]);
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
			else reject(new Error(`ffmpeg mux exited ${code}: ${stderr.trim()}`));
		});
	});
}
