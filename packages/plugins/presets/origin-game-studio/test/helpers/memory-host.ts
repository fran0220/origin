import type {
	PluginCommandSpawnHandle,
	PluginContext,
	PluginFsApi,
	PluginFsEntry,
	PluginStorageApi,
} from "@origin-org/plugin-sdk";
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

export interface FakeHostCalls {
	resolvedCwds: string[];
	upserted: Array<{ scope: unknown; definition: { id?: string; title: string } }>;
	runs: Array<{ definitionId: string; scope?: unknown; trigger?: unknown }>;
	recordingStarts: Array<{ projectKey: string; sessionId: string; url: string }>;
	recordingStops: string[];
	recordingProbes: Array<{ recordingId: string; kind: string; payload: unknown }>;
	checkpointLists: string[];
	checkpointReverts: Array<{ projectKey: string; checkpointId: string }>;
}

export function createFakeHostCalls(): FakeHostCalls {
	return {
		resolvedCwds: [],
		upserted: [],
		runs: [],
		recordingStarts: [],
		recordingStops: [],
		recordingProbes: [],
		checkpointLists: [],
		checkpointReverts: [],
	};
}

function identityFor(cwd: string) {
	return {
		cwd,
		evaluationScope: { kind: "project" as const, projectKey: "eval-key" },
		checkpointProjectKey: "checkpoint-key",
		recordingProjectKey: "recording-key",
	};
}

export function createToolContext(options?: {
	cwd?: string;
	fs?: MemoryFs;
	storage?: MemoryStorage;
	spawn?: PluginContext["command"]["spawn"];
	capture?: PluginContext["capture"];
	recording?: PluginContext["recording"] | null;
	calls?: FakeHostCalls;
	omitProject?: boolean;
}): { ctx: PluginContext; fs: MemoryFs; storage: MemoryStorage; calls: FakeHostCalls } {
	const fs = options?.fs ?? new MemoryFs(options?.cwd ?? "/tmp/game");
	const storage = options?.storage ?? new MemoryStorage();
	const calls = options?.calls ?? createFakeHostCalls();
	const recordingRecords = new Map<string, {
		id: string;
		projectKey: string;
		sessionId: string;
		startedAt: number;
		telemetryPath: string;
		inputPath: string;
		retention: "2h";
		status: "recording" | "ready";
		audio: "none";
		frames: [];
	}>();
	const recording =
		options?.recording === null
			? undefined
			: (options?.recording ?? {
					async start(request: { projectKey: string; sessionId: string; url: string }) {
						calls.recordingStarts.push(request);
						const record = {
							id: `rec-${calls.recordingStarts.length}`,
							projectKey: request.projectKey,
							sessionId: request.sessionId,
							startedAt: 1,
							telemetryPath: "/tmp/telemetry.jsonl",
							inputPath: "/tmp/input.jsonl",
							retention: "2h" as const,
							status: "recording" as const,
							audio: "none" as const,
							frames: [] as [],
						};
						recordingRecords.set(record.id, record);
						return record;
					},
					async stop(recordingId: string) {
						calls.recordingStops.push(recordingId);
						const current = recordingRecords.get(recordingId);
						if (!current) throw new Error(`missing ${recordingId}`);
						const ready = { ...current, status: "ready" as const, endedAt: 2, durationMs: 1 };
						recordingRecords.set(recordingId, ready);
						return ready;
					},
					async cancel(recordingId: string) {
						return this.stop(recordingId);
					},
					async list() {
						return [...recordingRecords.values()];
					},
					async read(recordingId: string) {
						const record = recordingRecords.get(recordingId);
						if (!record) throw new Error(`missing ${recordingId}`);
						return record;
					},
					async sample(request: { recordingId: string; contactSheet?: { columns: number } }) {
						return {
							recordingId: request.recordingId,
							frames: [{ atMs: 0, path: "/tmp/frame.png" }],
							...(request.contactSheet ? { contactSheetPath: "/tmp/sheet.png" } : {}),
						};
					},
					async clear() {},
					async probe(recordingId: string, kind: string, payload?: unknown) {
						calls.recordingProbes.push({ recordingId, kind, payload });
						if (kind === "input") return { ok: true, result: true };
						if (kind === "tick") return { ok: true, result: calls.recordingProbes.filter((item) => item.kind === "tick").length };
						if (kind === "advance") return { ok: true, result: 2 };
						return { ok: true, result: { tick: 0 } };
					},
				});
	const ctx = {
		plugin: { id: "origin-game-studio", version: "0.1.0" },
		fs,
		storage,
		command: {
			run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
			spawn: options?.spawn ?? (async () => createFakeSpawnHandle(5173)),
		},
		capture: options?.capture,
		recording,
		project: options?.omitProject
			? undefined
			: {
					async resolve(cwd: string) {
						calls.resolvedCwds.push(cwd);
						return identityFor(cwd);
					},
				},
		evaluation: {
			async upsertDefinition(request: { scope?: unknown; definition: { id?: string; title: string } }) {
				calls.upserted.push(request);
				return {
					id: request.definition.id ?? "def",
					revision: 1,
					title: request.definition.title,
					criteria: [],
					updatedAt: "2026-01-01T00:00:00.000Z",
				};
			},
			async run(request: { definitionId: string; scope?: unknown; trigger?: unknown }) {
				calls.runs.push(request);
				return {
					id: "attempt-1",
					definitionId: request.definitionId,
					definitionRevision: 1,
					trigger: request.trigger ?? { kind: "manual" },
					inputFingerprint: "fp",
					evidenceIds: [],
					findings: [],
					outcome: { kind: "passed", settledAt: "2026-01-01T00:00:00.000Z" },
					createdAt: "2026-01-01T00:00:00.000Z",
				};
			},
			async listDefinitions() {
				return [];
			},
			async listAttempts() {
				return [];
			},
			async get() {
				throw new Error("not found");
			},
			registerEvidenceProvider() {
				return { dispose() {} };
			},
		},
		checkpoints: {
			async list(projectKey?: string) {
				if (projectKey) calls.checkpointLists.push(projectKey);
				return [
					{
						id: "cp-1",
						operationId: "op-1",
						projectKey: projectKey ?? "checkpoint-key",
						sessionId: "s1",
						turnId: "t1",
						intent: "land",
						createdAt: 1,
						updatedAt: 1,
						phase: "settled" as const,
						decision: "kept" as const,
					},
				];
			},
			async get() {
				return undefined;
			},
			async requestRevert(projectKey: string, checkpointId: string) {
				calls.checkpointReverts.push({ projectKey, checkpointId });
				return {
					id: checkpointId,
					operationId: "op-1",
					projectKey,
					sessionId: "s1",
					turnId: "t1",
					intent: "revert",
					createdAt: 1,
					updatedAt: 2,
					phase: "settled" as const,
					decision: "reverted" as const,
				};
			},
		},
		conversation: { on: () => ({ dispose() {} }) },
		ui: {},
		agent: { registerTool: () => ({ dispose() {} }), registerHook: () => ({ dispose() {} }) },
		i18n: { locale: "zh", t: (key: string) => key, onChange: () => ({ dispose() {} }) },
	} as unknown as PluginContext;
	return { ctx, fs, storage, calls };
}
