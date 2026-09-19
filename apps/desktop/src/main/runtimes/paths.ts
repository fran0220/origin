import { dirname, join } from "node:path";
import { getAgentDir } from "@origin/coding-agent/config";
import manifest from "./manifest.json";

export type RuntimeType = "node" | "python" | "ffmpeg";

export interface PlatformEntry {
	filename: string;
	dir: string;
	archive: "tar.gz" | "zip";
}

export interface FfmpegBinaryEntry {
	filename: string;
	sha256: string;
	bin: string;
}

export interface FfmpegPlatformEntry {
	archive: "gz";
	dir: string;
	ffmpeg: FfmpegBinaryEntry;
	ffprobe: FfmpegBinaryEntry;
}

export interface RuntimeManifest {
	node: { version: string; sources: string[]; platforms: Record<string, PlatformEntry> };
	python: { version: string; release: string; sources: string[]; platforms: Record<string, PlatformEntry> };
	ffmpeg: {
		version: string;
		release: string;
		sources: string[];
		platforms: Record<string, FfmpegPlatformEntry>;
	};
	mirrors: { npmRegistry: string; pipIndexUrl: string; pipTrustedHost: string };
}

export const RUNTIME_MANIFEST = manifest as unknown as RuntimeManifest;

/**
 * 当前平台标识，形如 `darwin-arm64` / `win32-x64`，与 manifest.platforms 的键一致。
 * 直接用 Node 的 process.platform / process.arch，不做规范化——manifest 键就按这个约定写。
 */
export function currentPlatformTag(): string {
	return `${process.platform}-${process.arch}`;
}

/** 取当前平台的 Node/Python 运行时条目；平台不支持时返回 undefined。 */
export function platformEntry(type: "node" | "python"): PlatformEntry | undefined {
	return RUNTIME_MANIFEST[type].platforms[currentPlatformTag()];
}

export function ffmpegPlatformEntry(): FfmpegPlatformEntry | undefined {
	return RUNTIME_MANIFEST.ffmpeg.platforms[currentPlatformTag()];
}

export function runtimeVersion(type: RuntimeType): string {
	if (type === "ffmpeg") return RUNTIME_MANIFEST.ffmpeg.version;
	return RUNTIME_MANIFEST[type].version;
}

/** ~/.vetta —— 与 coding-agent 的 agent 目录同根，尊重 VETTA_CODING_AGENT_DIR 覆盖。 */
export function vettaRootDir(): string {
	return dirname(getAgentDir());
}

/** ~/.vetta/runtimes —— [[托管运行时]] 落地根目录。 */
export function runtimesDir(): string {
	return join(vettaRootDir(), "runtimes");
}

/** 某运行时某版本的安装目录：~/.vetta/runtimes/<type>/<version>/ */
export function installDir(type: RuntimeType, version: string = runtimeVersion(type)): string {
	return join(runtimesDir(), type, version);
}

/**
 * 运行时可执行文件所在的 bin 目录(用于 PATH 前置)。
 * - unix: <install>/bin
 * - windows: node 在安装根、python 在根 + Scripts
 */
export function binDirsFor(type: RuntimeType, version: string = runtimeVersion(type)): string[] {
	const root = installDir(type, version);
	if (process.platform === "win32") {
		if (type === "python") return [root, join(root, "Scripts")];
		return [root];
	}
	return [join(root, "bin")];
}

/** 运行时主可执行文件的绝对路径(用于校验「就绪」与系统对比)。 */
export function executablePathFor(type: RuntimeType, version: string = runtimeVersion(type)): string {
	const root = installDir(type, version);
	if (process.platform === "win32") {
		if (type === "python") return join(root, "python.exe");
		if (type === "ffmpeg") return join(root, "ffmpeg.exe");
		return join(root, "node.exe");
	}
	if (type === "python") return join(root, "bin", "python3");
	if (type === "ffmpeg") return join(root, "bin", "ffmpeg");
	return join(root, "bin", "node");
}

export function ffprobePathFor(version: string = runtimeVersion("ffmpeg")): string {
	const root = installDir("ffmpeg", version);
	return process.platform === "win32" ? join(root, "ffprobe.exe") : join(root, "bin", "ffprobe");
}

/** npm 全局安装前缀(私有目录,与运行时版本解耦、不污染系统)。 */
export function npmGlobalPrefixDir(): string {
	return join(runtimesDir(), ".npm-global");
}

/** npm 全局包可执行文件目录(加入 PATH)。 */
export function npmGlobalBinDir(): string {
	// npm 在 win 把 bin 放 prefix 根、unix 放 prefix/bin
	return process.platform === "win32" ? npmGlobalPrefixDir() : join(npmGlobalPrefixDir(), "bin");
}

export function npmCacheDir(): string {
	return join(runtimesDir(), ".npm-cache");
}

export function pipCacheDir(): string {
	return join(runtimesDir(), ".pip-cache");
}

/** 本地安装登记表路径：~/.vetta/runtimes/.cache/registry.json */
export function registryPath(): string {
	return join(runtimesDir(), ".cache", "registry.json");
}

/** 内置 vendor 根目录(打包后在 Resources/vendor;开发态通常不存在 → 走下载兜底)。 */
export function vendorDir(): string {
	// process.resourcesPath 仅在 packaged Electron 下有意义;dev 下指向无 vendor 的目录,
	// existsSync 检查会自然 false,seed 退回下载。
	return join(process.resourcesPath ?? "", "vendor");
}

/** 内置 vendor 中某运行时的原始发布归档。 */
export function vendorRuntimeArchivePath(type: "node" | "python"): string {
	const entry = platformEntry(type);
	if (!entry) return join(vendorDir(), type, "missing");
	return join(vendorDir(), type, entry.filename);
}

export function vendorFfmpegArchivePath(kind: "ffmpeg" | "ffprobe"): string {
	const entry = ffmpegPlatformEntry();
	if (!entry) return join(vendorDir(), "ffmpeg", "missing");
	return join(vendorDir(), "ffmpeg", entry[kind].filename);
}

/**
 * 内置 vendor 中某运行时的解压目录。
 * macOS 只能以这种形态内置——归档内部的 Mach-O 签不到名，而 Apple 公证会解开
 * 归档逐个校验，详见 docs/desktop/macos-auto-update.md。其余平台内置归档，
 * 该目录不存在。
 */
export function vendorRuntimeDir(type: RuntimeType): string {
	if (type === "ffmpeg") {
		const entry = ffmpegPlatformEntry();
		if (!entry) return join(vendorDir(), type, "missing");
		return join(vendorDir(), type, entry.dir);
	}
	const entry = platformEntry(type);
	if (!entry) return join(vendorDir(), type, "missing");
	return join(vendorDir(), type, entry.dir);
}
