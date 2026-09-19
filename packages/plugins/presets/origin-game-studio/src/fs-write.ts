import type { PluginFsApi } from "@origin-org/plugin-sdk";
import { dirname, joinPath } from "./paths";

export async function writeTextFile(fs: PluginFsApi, path: string, content: string): Promise<void> {
	await ensureDirectory(fs, dirname(path));
	await fs.writeFile(path, content, "utf8");
}

export async function ensureDirectory(fs: PluginFsApi, dirPath: string): Promise<void> {
	if (!dirPath || dirPath === "." || dirPath === "/") return;
	const existing = await fs.stat(dirPath);
	if (existing) return;
	await ensureDirectory(fs, dirname(dirPath));
	await fs.createDirectory(dirPath);
}

export async function fileExists(fs: PluginFsApi, path: string): Promise<boolean> {
	return (await fs.stat(path)) !== null;
}

export async function readTextFile(fs: PluginFsApi, path: string): Promise<string | null> {
	try {
		const result = await fs.readFile(path);
		return result.content;
	} catch {
		return null;
	}
}

export async function readJsonFile<T>(fs: PluginFsApi, path: string): Promise<T | null> {
	const text = await readTextFile(fs, path);
	if (text === null) return null;
	return JSON.parse(text) as T;
}

export function projectFile(cwd: string, relative: string): string {
	return joinPath(cwd, relative);
}
