import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { assertSha256, sha256File } from "./runtime-download.js";

export interface FfmpegBinaryInstall {
	readonly archivePath: string;
	readonly sha256: string;
	readonly outputName: string;
}

export interface FfmpegInstallOptions {
	readonly targetDirectory: string;
	readonly binaries: readonly FfmpegBinaryInstall[];
}

async function gunzipFile(archivePath: string, destinationPath: string): Promise<void> {
	await pipeline(createReadStream(archivePath), createGunzip(), createWriteStream(destinationPath));
}

/**
 * Install gzip-compressed static ffmpeg/ffprobe binaries into the managed runtime
 * directory. Checksums are verified before extraction; a failed check leaves the
 * previous install untouched.
 */
export async function installFfmpegBinaries(options: FfmpegInstallOptions): Promise<void> {
	const targetParent = dirname(options.targetDirectory);
	await mkdir(targetParent, { recursive: true });
	const stagingDirectory = await mkdtemp(join(targetParent, `.${basename(options.targetDirectory)}-ffmpeg-`));
	try {
		const binDirectory = process.platform === "win32" ? stagingDirectory : join(stagingDirectory, "bin");
		await mkdir(binDirectory, { recursive: true });
		for (const binary of options.binaries) {
			const actual = await sha256File(binary.archivePath);
			assertSha256(actual, binary.sha256, binary.archivePath);
			const outputPath = join(binDirectory, binary.outputName);
			await gunzipFile(binary.archivePath, outputPath);
			if (process.platform !== "win32") await chmod(outputPath, 0o755);
		}
		await rm(options.targetDirectory, { recursive: true, force: true });
		await rename(stagingDirectory, options.targetDirectory);
	} finally {
		if (existsSync(stagingDirectory)) await rm(stagingDirectory, { recursive: true, force: true });
	}
}

export function ffmpegSystemCandidates(): string[] {
	return process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"];
}

export function probeFfmpegVersion(executable: string): string | undefined {
	const result = spawnSync(executable, ["-version"], { encoding: "utf-8", timeout: 5_000 });
	if (result.status !== 0) return undefined;
	const match = `${result.stdout}${result.stderr}`.match(/ffmpeg version (\S+)/i);
	return match?.[1];
}
