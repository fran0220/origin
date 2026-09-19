import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { landScaffold, scaffoldEntries, sanitizeProjectName } from "../src/scaffold/copy";
import { MemoryFs } from "./helpers/memory-host";

function run(command: string, args: string[], cwd: string): Promise<{ exit: number; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
		let stderr = "";
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		child.on("error", reject);
		child.on("close", (code) => resolve({ exit: code ?? 1, stderr }));
	});
}

describe("game scaffold copy", () => {
	it("unions shared files with the canvas2d overlay and injects the project name", () => {
		const entries = scaffoldEntries("canvas2d");
		const paths = entries.map((entry) => entry.relative);
		expect(paths).toEqual(expect.arrayContaining(["package.json", "index.html", "src/main.ts", "src/core/probe.ts", "src/core/probe-bridge.ts"]));
		expect(paths.some((path) => path.endsWith("bun.lock"))).toBe(false);
		expect(paths.some((path) => path.includes("shaders"))).toBe(false);
		const pkg = entries.find((entry) => entry.relative === "package.json");
		expect(pkg?.content).toContain('"name": "game"');
	});

	it("sanitizes names used in package.json", () => {
		expect(sanitizeProjectName(" Maze Walker ")).toBe("maze-walker");
		expect(sanitizeProjectName("???")).toBe("game");
	});

	it("writes files through the plugin fs into an empty project", async () => {
		const fs = new MemoryFs("/tmp/game");
		const landing = await landScaffold(fs, "/tmp/game", "canvas2d", "Harbour Run");
		expect(landing.written).toContain("package.json");
		expect(landing.skipped).toEqual([]);
		const pkg = JSON.parse((await fs.readFile("/tmp/game/package.json")).content) as { name: string };
		expect(pkg.name).toBe("harbour-run");
		const html = (await fs.readFile("/tmp/game/index.html")).content;
		expect(html).toContain("<title>harbour-run</title>");
	});
});

describe("canvas2d scaffold is a real Vite project", () => {
	const temps: string[] = [];

	afterEach(async () => {
		await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	});

	it("copies onto disk and survives vite build", async () => {
		const root = await mkdtemp(join(tmpdir(), "origin-game-scaffold-"));
		temps.push(root);
		const { cp } = await import("node:fs/promises");
		const scaffoldRoot = join(import.meta.dirname, "../assets/game-scaffold");
		await cp(join(scaffoldRoot, "shared"), root, { recursive: true });
		await cp(join(scaffoldRoot, "canvas2d"), root, { recursive: true });
		await rm(join(root, "bun.lock"), { force: true });
		const pkgPath = join(root, "package.json");
		const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { name: string };
		expect(pkg.name).toBe("game");
		const install = await run("bun", ["install"], root);
		expect(install.exit, install.stderr).toBe(0);
		const build = await run("bun", ["x", "vite", "build"], root);
		expect(build.exit, build.stderr).toBe(0);
		expect(await readFile(join(root, "dist/index.html"), "utf8")).toContain("<canvas");
	});
});
