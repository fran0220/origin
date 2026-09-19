import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
	type CheckpointPolicy,
	type CheckpointStore,
	DEFAULT_CHECKPOINT_POLICY,
	type ExecutionReceipt,
	isExecutionReceipt,
	isMainlineCheckpoint,
	type MainlineCheckpoint,
	parseExecutionReceipt,
	parseMainlineCheckpoint,
} from "@vetta/runtime-checkpoints";
import {
	checkpointMainlinePath,
	checkpointPolicyPath,
	checkpointProjectDir,
	checkpointReceiptsPath,
} from "./layout.js";

export interface FileCheckpointStoreOptions {
	/** Account-scoped checkpoints root, e.g. `<agentDir>/logged-out/checkpoints`. */
	readonly checkpointRoot: string | (() => string);
}

interface CheckpointFileState {
	readonly records: MainlineCheckpoint[];
	readonly byId: Map<string, number>;
}

/**
 * Append-only JSONL store under `<checkpointRoot>/<projectKey>/`.
 * Latest record for an id wins; receipts never rewrite.
 */
export class FileCheckpointStore implements CheckpointStore {
	private readonly checkpointRoot: string | (() => string);
	private readonly cache = new Map<string, CheckpointFileState>();
	private readonly receiptCache = new Map<string, ExecutionReceipt[]>();
	private readonly queues = new Map<string, Promise<void>>();

	constructor(options: FileCheckpointStoreOptions) {
		this.checkpointRoot = options.checkpointRoot;
	}

	private root(): string {
		return typeof this.checkpointRoot === "function" ? this.checkpointRoot() : this.checkpointRoot;
	}

	private cacheKey(projectKey: string): string {
		return `${this.root()}\0${projectKey}`;
	}

	async list(projectKey: string): Promise<readonly MainlineCheckpoint[]> {
		return (await this.loadCheckpoints(projectKey)).records;
	}

	async get(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint | undefined> {
		const state = await this.loadCheckpoints(projectKey);
		const index = state.byId.get(checkpointId);
		return index === undefined ? undefined : state.records[index];
	}

	async getByOperationId(projectKey: string, operationId: string): Promise<MainlineCheckpoint | undefined> {
		const state = await this.loadCheckpoints(projectKey);
		return [...state.records].reverse().find((checkpoint) => checkpoint.operationId === operationId);
	}

	async append(checkpoint: MainlineCheckpoint): Promise<void> {
		await this.mutate(checkpoint.projectKey, async (state) => {
			if (state.byId.has(checkpoint.id)) return state;
			await appendJsonl(checkpointMainlinePath(this.root(), checkpoint.projectKey), checkpoint);
			return insert(state, checkpoint);
		});
	}

	async replace(checkpoint: MainlineCheckpoint): Promise<void> {
		await this.mutate(checkpoint.projectKey, async (state) => {
			await appendJsonl(checkpointMainlinePath(this.root(), checkpoint.projectKey), checkpoint);
			return insert(state, checkpoint);
		});
	}

	async listIncomplete(projectKey: string): Promise<readonly MainlineCheckpoint[]> {
		return (await this.loadCheckpoints(projectKey)).records.filter(
			(checkpoint) => checkpoint.phase === "verifying" || checkpoint.phase === "reverting",
		);
	}

	async listReceipts(projectKey: string): Promise<readonly ExecutionReceipt[]> {
		return this.loadReceipts(projectKey);
	}

	async getReceipt(projectKey: string, executionId: string): Promise<ExecutionReceipt | undefined> {
		return (await this.loadReceipts(projectKey)).find((receipt) => receipt.executionId === executionId);
	}

	async appendReceipt(projectKey: string, receipt: ExecutionReceipt): Promise<void> {
		await this.enqueue(projectKey, async () => {
			const existing = await this.loadReceipts(projectKey);
			if (existing.some((candidate) => candidate.executionId === receipt.executionId)) return;
			await appendJsonl(checkpointReceiptsPath(this.root(), projectKey), receipt);
			this.receiptCache.set(this.cacheKey(projectKey), [...existing, receipt]);
		});
	}

	async readPolicy(projectKey: string): Promise<CheckpointPolicy> {
		try {
			const raw = JSON.parse(await readFile(checkpointPolicyPath(this.root(), projectKey), "utf8")) as unknown;
			if (!isPolicy(raw) || raw.projectKey !== projectKey) {
				return { ...DEFAULT_CHECKPOINT_POLICY, projectKey };
			}
			return raw;
		} catch {
			return { ...DEFAULT_CHECKPOINT_POLICY, projectKey };
		}
	}

	async writePolicy(policy: CheckpointPolicy): Promise<void> {
		const path = checkpointPolicyPath(this.root(), policy.projectKey);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `${JSON.stringify(policy)}\n`, "utf8");
	}

	private async loadCheckpoints(projectKey: string): Promise<CheckpointFileState> {
		const key = this.cacheKey(projectKey);
		const cached = this.cache.get(key);
		if (cached) return cached;
		const records = await readJsonl(checkpointMainlinePath(this.root(), projectKey), parseMainlineCheckpoint);
		const latest = collapseLatest(records, (record) => record.id);
		const byId = new Map(latest.map((record, index) => [record.id, index] as const));
		const state = { records: latest, byId };
		this.cache.set(key, state);
		return state;
	}

	private async loadReceipts(projectKey: string): Promise<ExecutionReceipt[]> {
		const key = this.cacheKey(projectKey);
		const cached = this.receiptCache.get(key);
		if (cached) return cached;
		const records = await readJsonl(checkpointReceiptsPath(this.root(), projectKey), parseExecutionReceipt);
		const latest = collapseLatest(records, (record) => record.executionId);
		this.receiptCache.set(key, latest);
		return latest;
	}

	private async mutate(
		projectKey: string,
		update: (state: CheckpointFileState) => Promise<CheckpointFileState>,
	): Promise<void> {
		await this.enqueue(projectKey, async () => {
			await mkdir(checkpointProjectDir(this.root(), projectKey), { recursive: true });
			const next = await update(await this.loadCheckpoints(projectKey));
			this.cache.set(this.cacheKey(projectKey), next);
		});
	}

	private async enqueue(projectKey: string, task: () => Promise<void>): Promise<void> {
		const key = this.cacheKey(projectKey);
		const previous = this.queues.get(key) ?? Promise.resolve();
		const run = previous.catch(() => undefined).then(task);
		this.queues.set(key, run);
		await run;
	}
}

function insert(state: CheckpointFileState, checkpoint: MainlineCheckpoint): CheckpointFileState {
	const records = state.records.slice();
	const existing = state.byId.get(checkpoint.id);
	if (existing === undefined) {
		records.push(checkpoint);
	} else {
		records[existing] = checkpoint;
	}
	const byId = new Map(records.map((record, index) => [record.id, index] as const));
	return { records, byId };
}

async function readJsonl<T>(path: string, parse: (value: unknown) => T | undefined): Promise<T[]> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const records: T[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = parse(JSON.parse(trimmed) as unknown);
			if (parsed) records.push(parsed);
		} catch {
			// Skip a corrupt line so a later valid record can still recover the timeline.
		}
	}
	return records;
}

async function appendJsonl(path: string, value: unknown): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const handle = await writeFile(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "a" });
	return handle;
}

function collapseLatest<T>(records: readonly T[], keyOf: (record: T) => string): T[] {
	const latest = new Map<string, T>();
	for (const record of records) latest.set(keyOf(record), record);
	const order: string[] = [];
	const seen = new Set<string>();
	for (const record of records) {
		const key = keyOf(record);
		if (seen.has(key)) continue;
		seen.add(key);
		order.push(key);
	}
	return order.map((key) => latest.get(key)).filter((record): record is T => record !== undefined);
}

function isPolicy(value: unknown): value is CheckpointPolicy {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.projectKey === "string" &&
		(record.vcsMode === "shadow" || record.vcsMode === "project-mainline") &&
		(record.onVerificationFailure === "keep-for-user" || record.onVerificationFailure === "auto-revert") &&
		Array.isArray(record.verificationCommands) &&
		record.verificationCommands.every((command) => typeof command === "string")
	);
}

export function isDurableCheckpointRecord(value: unknown): boolean {
	return isMainlineCheckpoint(value) || isExecutionReceipt(value);
}
