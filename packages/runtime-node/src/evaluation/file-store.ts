import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type EvaluationAttempt,
	type EvaluationDefinition,
	EvaluationError,
	type EvaluationEvidence,
	type EvaluationScope,
	type EvaluationStore,
	parseEvaluationAttemptRecord,
	parseEvaluationDefinitionRecord,
	parseEvaluationEvidenceRecord,
	scopeKey,
	toAttemptRecord,
	toDefinitionRecord,
	toEvidenceRecord,
} from "@vetta/runtime-evaluation";

export interface FileEvaluationStoreOptions {
	/**
	 * Evaluation ledger root (`…/evaluation`). Hosts should pass
	 * `resolveAccountScopedDir(..., "evaluation")` so data lands in the
	 * signed-in or logged-out partition instead of `<agentDir>/evaluation`.
	 */
	readonly rootDir: string | (() => string);
}

function sanitizeScopeSegment(key: string): string {
	return key.replace(/[^a-zA-Z0-9._:-]+/g, "_");
}

export class FileEvaluationStore implements EvaluationStore {
	constructor(private readonly options: FileEvaluationStoreOptions) {}

	private ledgerRoot(): string {
		const root = this.options.rootDir;
		return typeof root === "function" ? root() : root;
	}

	private scopeDir(scope: EvaluationScope): string {
		return join(this.ledgerRoot(), sanitizeScopeSegment(scopeKey(scope)));
	}

	private async ensureDir(scope: EvaluationScope): Promise<string> {
		const dir = this.scopeDir(scope);
		await mkdir(join(dir, "evidence"), { recursive: true });
		return dir;
	}

	async listDefinitions(scope: EvaluationScope): Promise<readonly EvaluationDefinition[]> {
		const records = await this.readJsonl(
			join(this.scopeDir(scope), "definitions.jsonl"),
			parseEvaluationDefinitionRecord,
		);
		const latest = new Map<string, EvaluationDefinition>();
		for (const record of records) latest.set(record.id, record);
		return [...latest.values()].sort((left, right) => left.title.localeCompare(right.title));
	}

	async getDefinition(scope: EvaluationScope, definitionId: string): Promise<EvaluationDefinition | undefined> {
		const definitions = await this.listDefinitions(scope);
		return definitions.find((definition) => definition.id === definitionId);
	}

	async upsertDefinition(scope: EvaluationScope, definition: EvaluationDefinition): Promise<EvaluationDefinition> {
		const dir = await this.ensureDir(scope);
		await appendJsonl(join(dir, "definitions.jsonl"), toDefinitionRecord(definition));
		return definition;
	}

	async listAttempts(scope: EvaluationScope): Promise<readonly EvaluationAttempt[]> {
		const records = await this.readJsonl(join(this.scopeDir(scope), "attempts.jsonl"), parseEvaluationAttemptRecord);
		return [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
	}

	async getAttempt(scope: EvaluationScope, attemptId: string): Promise<EvaluationAttempt | undefined> {
		const attempts = await this.listAttempts(scope);
		return attempts.find((attempt) => attempt.id === attemptId);
	}

	async findAttemptByFingerprint(scope: EvaluationScope, fingerprint: string): Promise<EvaluationAttempt | undefined> {
		const attempts = await this.listAttempts(scope);
		return attempts.find(
			(attempt) =>
				attempt.inputFingerprint === fingerprint &&
				attempt.outcome.kind !== "cancelled" &&
				attempt.outcome.kind !== "budget-limited",
		);
	}

	async appendAttempt(attempt: EvaluationAttempt): Promise<void> {
		const existing = await this.getAttempt(attempt.scope, attempt.id);
		if (existing) throw new EvaluationError("immutable", `Evaluation attempt ${attempt.id} is immutable`);
		const dir = await this.ensureDir(attempt.scope);
		await appendJsonl(join(dir, "attempts.jsonl"), toAttemptRecord(attempt));
	}

	async putEvidence(scope: EvaluationScope, evidence: EvaluationEvidence): Promise<void> {
		const dir = await this.ensureDir(scope);
		await writeFile(
			join(dir, "evidence", `${sanitizeScopeSegment(evidence.id)}.json`),
			`${JSON.stringify(toEvidenceRecord(evidence))}\n`,
			"utf8",
		);
	}

	async getEvidence(scope: EvaluationScope, evidenceId: string): Promise<EvaluationEvidence | undefined> {
		try {
			const raw = await readFile(
				join(this.scopeDir(scope), "evidence", `${sanitizeScopeSegment(evidenceId)}.json`),
				"utf8",
			);
			return parseEvaluationEvidenceRecord(JSON.parse(raw) as unknown);
		} catch {
			return undefined;
		}
	}

	async listEvidence(scope: EvaluationScope, evidenceIds: readonly string[]): Promise<readonly EvaluationEvidence[]> {
		const result: EvaluationEvidence[] = [];
		for (const id of evidenceIds) {
			const item = await this.getEvidence(scope, id);
			if (item) result.push(item);
		}
		return result;
	}

	private async readJsonl<T>(path: string, parse: (value: unknown) => T | undefined): Promise<T[]> {
		let text: string;
		try {
			text = await readFile(path, "utf8");
		} catch {
			return [];
		}
		const records: T[] = [];
		for (const line of text.split("\n")) {
			if (line.trim().length === 0) continue;
			try {
				const parsed = parse(JSON.parse(line) as unknown);
				if (parsed) records.push(parsed);
			} catch {
				/* skip corrupt lines */
			}
		}
		return records;
	}
}

async function appendJsonl(path: string, value: unknown): Promise<void> {
	await writeFile(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", flag: "a" });
}

export async function listEvaluationScopeKeys(rootDir: string): Promise<readonly string[]> {
	try {
		const entries = await readdir(rootDir, { withFileTypes: true });
		return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return [];
	}
}
