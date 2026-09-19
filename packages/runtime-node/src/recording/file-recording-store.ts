import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	isRecordingExpired,
	parseRecordingRecord,
	type RecordingListQuery,
	type RecordingRecord,
	type RecordingStore,
} from "@vetta/runtime-recording";

export interface FileRecordingStoreOptions {
	readonly rootDirectory: string;
	readonly now?: () => number;
}

interface ProjectIndex {
	readonly records: RecordingRecord[];
}

export class FileRecordingStore implements RecordingStore {
	constructor(private readonly options: FileRecordingStoreOptions) {}

	directoryFor(record: RecordingRecord): string {
		return join(this.options.rootDirectory, record.projectKey, record.id);
	}

	async put(record: RecordingRecord): Promise<void> {
		const parsed = parseRecordingRecord(record);
		const directory = this.directoryFor(parsed);
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, "record.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
		const index = await this.readProjectIndex(parsed.projectKey);
		const next = index.records.filter((item) => item.id !== parsed.id);
		next.push(parsed);
		await this.writeProjectIndex(parsed.projectKey, next);
	}

	async get(recordingId: string): Promise<RecordingRecord | undefined> {
		for (const record of await this.allRecords()) {
			if (record.id === recordingId) return record;
		}
		return undefined;
	}

	async list(query?: RecordingListQuery): Promise<readonly RecordingRecord[]> {
		const now = this.options.now?.() ?? Date.now();
		return (await this.allRecords()).filter((record) => {
			if (query?.projectKey && record.projectKey !== query.projectKey) return false;
			if (query?.sessionId && record.sessionId !== query.sessionId) return false;
			if (!query?.includeExpired && isRecordingExpired(record, now)) return false;
			return true;
		});
	}

	async delete(recordingId: string): Promise<void> {
		const record = await this.get(recordingId);
		if (!record) return;
		await rm(this.directoryFor(record), { recursive: true, force: true });
		const remaining = (await this.readProjectIndex(record.projectKey)).records.filter(
			(item) => item.id !== recordingId,
		);
		await this.writeProjectIndex(record.projectKey, remaining);
	}

	async sweepExpired(nowMs = this.options.now?.() ?? Date.now()): Promise<readonly string[]> {
		const removed: string[] = [];
		for (const record of await this.allRecords({ includeOrphans: true })) {
			if (!isRecordingExpired(record, nowMs)) continue;
			await this.delete(record.id);
			removed.push(record.id);
		}
		await this.removeOrphanDirectories();
		return removed;
	}

	private async allRecords(options?: { includeOrphans?: boolean }): Promise<RecordingRecord[]> {
		await mkdir(this.options.rootDirectory, { recursive: true });
		const records: RecordingRecord[] = [];
		const seen = new Set<string>();
		for (const projectKey of await this.listDirectories(this.options.rootDirectory)) {
			for (const record of (await this.readProjectIndex(projectKey)).records) {
				records.push(record);
				seen.add(record.id);
			}
			if (!options?.includeOrphans) continue;
			for (const recordingId of await this.listDirectories(join(this.options.rootDirectory, projectKey))) {
				if (seen.has(recordingId) || recordingId === ".") continue;
				const orphanPath = join(this.options.rootDirectory, projectKey, recordingId, "record.json");
				try {
					const orphan = parseRecordingRecord(JSON.parse(await readFile(orphanPath, "utf8")) as unknown);
					records.push(orphan);
					seen.add(orphan.id);
				} catch {
					await rm(join(this.options.rootDirectory, projectKey, recordingId), { recursive: true, force: true });
				}
			}
		}
		return records;
	}

	private async removeOrphanDirectories(): Promise<void> {
		for (const projectKey of await this.listDirectories(this.options.rootDirectory)) {
			const indexed = new Set((await this.readProjectIndex(projectKey)).records.map((record) => record.id));
			for (const recordingId of await this.listDirectories(join(this.options.rootDirectory, projectKey))) {
				if (indexed.has(recordingId)) continue;
				await rm(join(this.options.rootDirectory, projectKey, recordingId), { recursive: true, force: true });
			}
		}
	}

	private async readProjectIndex(projectKey: string): Promise<ProjectIndex> {
		const path = join(this.options.rootDirectory, projectKey, "index.json");
		try {
			const parsed = JSON.parse(await readFile(path, "utf8")) as { records?: unknown };
			const records = Array.isArray(parsed.records)
				? parsed.records.flatMap((item) => {
						try {
							return [parseRecordingRecord(item)];
						} catch {
							return [];
						}
					})
				: [];
			return { records };
		} catch {
			return { records: [] };
		}
	}

	private async writeProjectIndex(projectKey: string, records: readonly RecordingRecord[]): Promise<void> {
		const directory = join(this.options.rootDirectory, projectKey);
		await mkdir(directory, { recursive: true });
		await writeFile(join(directory, "index.json"), `${JSON.stringify({ records }, null, 2)}\n`, "utf8");
	}

	private async listDirectories(path: string): Promise<string[]> {
		try {
			const entries = await readdir(path, { withFileTypes: true });
			return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
		} catch {
			return [];
		}
	}
}
