// 构建期陷阱守卫：主进程源码里不得出现 `new URL("<字面量>", import.meta.url)`。
//
// 背景（真实回归）：quickpanel-trigger.ts 曾用
//     fork(fileURLToPath(new URL(<入口文件名字面量>, import.meta.url)))
// 定位 uiohook 宿主入口。Vite 把这种写法识别成静态资源引用，会把被指向的
// 宿主 **源码** 内联成 `data:video/mp2t;base64,...`，产物里 fileURLToPath
// 立刻抛 ERR_INVALID_URL_SCHEME —— 宿主子进程永远 fork 不起来，快捷面板（双击 ⌘）
// 和应用快照（双 Shift 同按）在开发和生产环境同时静默失效。
//
// 类型检查和单元测试都看不见这个 bug（它发生在打包变换里），所以在源码层禁掉该写法：
// 同目录产物请用 dirname(fileURLToPath(import.meta.url)) 拼接，或显式加 /* @vite-ignore */。

import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const MAIN_DIR = dirname(fileURLToPath(import.meta.url));

/** `new URL("…", import.meta.url)` / `new URL('…', import.meta.url)`，允许中间有换行与注释。 */
const STATIC_URL_ASSET = /new URL\(\s*(?:\/\*[^*]*\*\/\s*)?["'][^"']*["']\s*,\s*import\.meta\.url\s*\)/g;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules") continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			collectSourceFiles(full, out);
		} else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
			out.push(full);
		}
	}
	return out;
}

describe("main bundle asset-URL guard", () => {
	it("主进程源码不使用会被 Vite 内联成 data: URL 的 new URL(字面量, import.meta.url)", () => {
		const offenders: string[] = [];
		for (const file of collectSourceFiles(MAIN_DIR)) {
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(STATIC_URL_ASSET)) {
				// @vite-ignore 会关掉 Vite 的资源内联，是显式豁免。
				if (match[0].includes("@vite-ignore")) continue;
				offenders.push(`${relative(MAIN_DIR, file)}: ${match[0].replace(/\s+/g, " ")}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it("uiohook 宿主入口按同目录路径拼接解析，不经过 new URL 资源引用", () => {
		const source = readFileSync(join(MAIN_DIR, "quickpanel-trigger.ts"), "utf8");
		expect(source).toContain('join(HOST_DIR, "uiohook-worker.js")');
		expect(source).toContain("dirname(fileURLToPath(import.meta.url))");
	});

	it("recording audio preload 按同目录路径拼接，并由 vite.main 复制到 dist/main", () => {
		const engine = readFileSync(join(MAIN_DIR, "recording/recording-engine.ts"), "utf8");
		expect(engine).toContain('join(dirname(fileURLToPath(import.meta.url)), "audio-preload.js")');
		expect(engine).toContain("AUDIO_PRELOAD_PATH");
		const viteMain = readFileSync(join(MAIN_DIR, "../../vite.main.config.ts"), "utf8");
		expect(viteMain).toContain("copy-recording-audio-preload");
		expect(viteMain).toContain('resolve(outDir, "audio-preload.js")');
		expect(viteMain).toContain("src/main/recording/audio-preload.js");
	});

	it("vite.main writeBundle 把 audio-preload.js 复制到主进程产物目录", async () => {
		const desktopRoot = join(MAIN_DIR, "../..");
		const outDir = await mkdtemp(join(tmpdir(), "audio-preload-test-"));
		const previousCwd = process.cwd();
		try {
			process.chdir(desktopRoot);
			const configModule = (await import(pathToFileURL(join(desktopRoot, "vite.main.config.ts")).href)) as {
				default: (env: { mode: string }) => {
					plugins?: Array<{ name: string; writeBundle?: (options: { dir?: string }) => void }>;
				};
			};
			const config = configModule.default({ mode: "production" });
			const plugin = config.plugins?.find((item) => item.name === "copy-recording-audio-preload");
			expect(plugin?.writeBundle).toEqual(expect.any(Function));
			mkdirSync(outDir, { recursive: true });
			plugin?.writeBundle?.({ dir: outDir });
			const copied = await readFile(join(outDir, "audio-preload.js"), "utf8");
			const source = await readFile(join(MAIN_DIR, "recording/audio-preload.js"), "utf8");
			expect(copied).toBe(source);
			expect(copied).toContain("vetta:recording:audio");
		} finally {
			process.chdir(previousCwd);
			await rm(outDir, { recursive: true, force: true });
		}
	});

	// 回归：主线程 import uiohook-napi 只为取键码常量，却在主线程 Environment 注册了
	// napi env cleanup hook；退出时它替 worker 跑 uiohook_worker_stop()，对已失效的
	// CFRunLoopRef 调 CFRunLoopCopyCurrentMode → SIGTRAP，用户看到「Vetta 意外退出」。
	// 原生 addon 只允许在 uiohook-worker.ts（worker 线程）里加载。
	it("除 uiohook-worker.ts 外，主进程源码不加载 uiohook-napi 原生模块", () => {
		const offenders: string[] = [];
		for (const file of collectSourceFiles(MAIN_DIR)) {
			if (file.endsWith("uiohook-worker.ts")) continue;
			// 只看真实语句，注释里提到模块名不算（本守卫的理由就写在注释里）。
			const code = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
			if (/from "uiohook-napi"|require\("uiohook-napi"\)/.test(code)) {
				offenders.push(relative(MAIN_DIR, file));
			}
		}
		expect(offenders).toEqual([]);
	});
});
