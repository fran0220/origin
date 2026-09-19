import type {
	PluginCommandSpawnHandle,
	PluginContext,
	PluginFsApi,
	PluginFsEntry,
	PluginStorageApi,
} from "@vetta-org/plugin-sdk";
import { joinPath } from "../../src/paths";

export class MemoryFs implements PluginFsApi {
	readonly files = new Map<string, string>();
	readonly dirs = new Set<string>();

	constructor(root?: string) {
		if (root) this.dirs.add(root);
	}

	async readDir(dirPath: string): Promise<PluginFsEntry[]> {
		const prefix = `${dirPath.replace(/\/$/, "")}/`;
		const names = new Set<string>();
		const entries: PluginFsEntry[] = [];
		for (const dir of this.dirs) {
			if (dir.startsWith(prefix)) {
				const rest = dir.slice(prefix.length);
				const name = rest.split("/")[0];
				if (name && !names.has(name) && !rest.includes("/")) {
					names.add(name);
					entries.push({ name, path: joinPath(dirPath, name), isDirectory: true, size: 0, modifiedAt: 0 });
				}
			}
		}
		for (const path of this.files.keys()) {
			if (path.startsWith(prefix)) {
				const rest = path.slice(prefix.length);
				const name = rest.split("/")[0];
				if (name && !names.has(name) && !rest.includes("/")) {
					names.add(name);
					entries.push({
						name,
						path: joinPath(dirPath, name),
						isDirectory: false,
						size: this.files.get(path)?.length ?? 0,
						modifiedAt: 0,
					});
				}
			}
		}
		return entries;
	}

	async readFile(filePath: string) {
		const content = this.files.get(filePath);
		if (content === undefined) throw new Error(`missing ${filePath}`);
		return { content, encoding: "utf8" as const };
	}

	async readBinaryFile(filePath: string) {
		const content = this.files.get(filePath);
		if (content === undefined) throw new Error(`missing ${filePath}`);
		return { data: btoa(content), mimeType: "text/plain", size: content.length };
	}

	async writeFile(filePath: string, content: string): Promise<void> {
		this.files.set(filePath, content);
		const parts = filePath.split("/");
		parts.pop();
		let acc = "";
		for (const part of parts) {
			acc = acc ? `${acc}/${part}` : part;
			this.dirs.add(acc);
		}
	}

	async stat(filePath: string) {
		if (this.files.has(filePath) || this.dirs.has(filePath)) {
			return { size: this.files.get(filePath)?.length ?? 0, modifiedAt: 0, createdAt: 0 };
		}
		return null;
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const content = this.files.get(oldPath);
		if (content === undefined) throw new Error(`missing ${oldPath}`);
		this.files.delete(oldPath);
		this.files.set(newPath, content);
	}

	async delete(targetPath: string): Promise<void> {
		this.files.delete(targetPath);
		this.dirs.delete(targetPath);
	}

	async move(sourcePath: string, destDir: string): Promise<void> {
		const name = sourcePath.split("/").pop() ?? sourcePath;
		await this.rename(sourcePath, joinPath(destDir, name));
	}

	async createDirectory(dirPath: string): Promise<void> {
		this.dirs.add(dirPath);
	}

	async listFilesRecursive(rootPath: string) {
		const prefix = `${rootPath.replace(/\/$/, "")}/`;
		return [...this.files.keys()]
			.filter((path) => path.startsWith(prefix) || path === rootPath)
			.map((path) => ({
				name: path.split("/").pop() ?? path,
				path,
				relPath: path === rootPath ? "." : path.slice(prefix.length),
			}));
	}

	async saveAs(): Promise<string | null> {
		return null;
	}

	watchDirectory() {
		return { dispose() {} };
	}
}

export class MemoryStorage implements PluginStorageApi {
	readonly files = new Map<string, string>();
	revision = "0";

	async list(prefix = ""): Promise<string[]> {
		return [...this.files.keys()].filter((path) => path.startsWith(prefix));
	}

	async readFile(path: string): Promise<string | null> {
		return this.files.get(path) ?? null;
	}

	async writeFile(path: string, data: string) {
		this.files.set(path, data);
		this.revision = String(Number(this.revision) + 1);
		return { revision: this.revision, changedPaths: [path] };
	}

	async commit(changes: readonly { type: "write"; path: string; data: string; encoding: "utf8" | "base64" }[] | readonly { type: "remove"; path: string }[]) {
		const changedPaths: string[] = [];
		for (const change of changes) {
			if (change.type === "write") this.files.set(change.path, change.data);
			else this.files.delete(change.path);
			changedPaths.push(change.path);
		}
		this.revision = String(Number(this.revision) + 1);
		return { revision: this.revision, changedPaths };
	}

	async readSnapshot(paths: readonly string[]) {
		const files: Record<string, string | null> = {};
		for (const path of paths) files[path] = this.files.get(path) ?? null;
		return { revision: this.revision, files };
	}

	async putBlob() {
		return { id: "blob", url: "blob:memory", mimeType: "application/octet-stream" };
	}

	async putBlobFromFile() {
		return { id: "blob", url: "blob:memory", mimeType: "application/octet-stream" };
	}

	async readBlob() {
		return null;
	}

	async getBlobRef() {
		return null;
	}

	async deleteBlob(): Promise<void> {}
}

export function createFakeSpawnHandle(port: number, running = true, output = ""): PluginCommandSpawnHandle {
	let stopped = !running;
	return {
		spawnId: `spawn-${port}`,
		pid: 1000 + port,
		port,
		async stop() {
			stopped = true;
		},
		async status() {
			return { running: !stopped, pid: 1000 + port, port, recentOutput: output };
		},
		onExit() {
			return { dispose() {} };
		},
	};
}

export function createToolContext(options?: {
	cwd?: string;
	fs?: MemoryFs;
	storage?: MemoryStorage;
	spawn?: PluginContext["command"]["spawn"];
	capture?: PluginContext["capture"];
}): { ctx: PluginContext; fs: MemoryFs; storage: MemoryStorage } {
	const fs = options?.fs ?? new MemoryFs(options?.cwd ?? "/tmp/game");
	const storage = options?.storage ?? new MemoryStorage();
	const ctx = {
		plugin: { id: "origin-game-studio", version: "0.1.0" },
		fs,
		storage,
		command: {
			run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			spawn: options?.spawn ?? (async () => createFakeSpawnHandle(5173)),
		},
		capture: options?.capture,
		conversation: { on: () => ({ dispose() {} }) },
		ui: {},
		agent: { registerTool: () => ({ dispose() {} }), registerHook: () => ({ dispose() {} }) },
		i18n: { locale: "zh", t: (key: string) => key, onChange: () => ({ dispose() {} }) },
	} as unknown as PluginContext;
	return { ctx, fs, storage };
}
