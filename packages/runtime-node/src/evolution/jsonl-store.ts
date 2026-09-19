import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	type EvolutionCommitResult,
	type EvolutionLedgerStore,
	type EvolutionScope,
	type EvolutionState,
	emptyEvolutionState,
	formatScope,
	HISTORY_DEPTH,
	parseRefinementEventRecord,
	type RefinementEvent,
	replayEvents,
	validateEvolutionState,
	validateRefinementEvent,
} from "@origin/runtime-evolution";
import lockfile from "proper-lockfile";

function scopeFileName(scope: EvolutionScope): string {
	if (scope.kind === "global") return "global.jsonl";
	return join("subjects", `${encodeURIComponent(scope.subjectId)}.jsonl`);
}

function serializeLine(event: RefinementEvent): string {
	return `${JSON.stringify(event)}\n`;
}

async function readEvents(path: string, scope: EvolutionScope): Promise<RefinementEvent[]> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const events: RefinementEvent[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		events.push(validateRefinementEvent(parseRefinementEventRecord(JSON.parse(trimmed) as unknown)));
	}
	if (events.length > 0) {
		replayEvents(scope, events);
	}
	return events;
}

export interface FileEvolutionLedgerStoreOptions {
	readonly rootDir: string;
}

/**
 * Append-only JSONL ledger under an account-scoped `evolution/` root
 * (`logged-out/evolution` or `accounts/<hash>/evolution`).
 * CAS is enforced with a per-file lock plus expectedRevision.
 */
export class FileEvolutionLedgerStore implements EvolutionLedgerStore {
	constructor(private readonly options: FileEvolutionLedgerStoreOptions) {}

	private filePath(scope: EvolutionScope): string {
		return join(this.options.rootDir, scopeFileName(scope));
	}

	private async withLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
		await mkdir(dirname(path), { recursive: true });
		try {
			await writeFile(path, "", { encoding: "utf8", flag: "wx" });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
		const release = await lockfile.lock(path, { realpath: false });
		try {
			return await operation();
		} finally {
			await release();
		}
	}

	async load(scope: EvolutionScope): Promise<EvolutionState> {
		const events = await readEvents(this.filePath(scope), scope);
		return events.length === 0 ? emptyEvolutionState(scope) : replayEvents(scope, events);
	}

	async commit(input: {
		readonly scope: EvolutionScope;
		readonly expectedRevision: number;
		readonly state: EvolutionState;
		readonly event: RefinementEvent;
	}): Promise<EvolutionCommitResult> {
		validateRefinementEvent(input.event);
		validateEvolutionState(input.state);
		if (formatScope(input.event.scope) !== formatScope(input.scope)) {
			throw new Error(`event scope ${formatScope(input.event.scope)} does not match ${formatScope(input.scope)}`);
		}
		const path = this.filePath(input.scope);
		return this.withLock(path, async () => {
			const events = await readEvents(path, input.scope);
			const storedRevision = events.length === 0 ? 0 : (events[events.length - 1]?.revision ?? 0);
			if (storedRevision !== input.expectedRevision) {
				return { status: "revision-conflict", storedRevision };
			}
			if (input.event.parentDigest !== (events.length === 0 ? null : (events[events.length - 1]?.digest ?? null))) {
				return { status: "revision-conflict", storedRevision };
			}
			await appendFile(path, serializeLine(input.event), "utf8");
			return { status: "committed", storedRevision: input.event.revision };
		});
	}

	async history(scope: EvolutionScope, limit: number): Promise<readonly RefinementEvent[]> {
		const events = await readEvents(this.filePath(scope), scope);
		const bounded = events.slice(-Math.min(Math.max(limit, 0) || HISTORY_DEPTH, HISTORY_DEPTH));
		return [...bounded].reverse();
	}

	async event(scope: EvolutionScope, digest: string): Promise<RefinementEvent | undefined> {
		const events = await readEvents(this.filePath(scope), scope);
		return events.find((item) => item.digest === digest);
	}
}

export function createFileEvolutionLedgerStore(rootDir: string): FileEvolutionLedgerStore {
	return new FileEvolutionLedgerStore({ rootDir });
}

export async function replaceEvolutionFileAtomically(path: string, events: readonly RefinementEvent[]): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.${process.pid}.tmp`;
	await writeFile(tmp, events.map(serializeLine).join(""), "utf8");
	await rename(tmp, path);
}
