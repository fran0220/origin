import { EvaluationError } from "./errors.js";
import type { EvaluationStore } from "./ports.js";
import { sameScope, scopeKey } from "./scope.js";
import type { EvaluationAttempt, EvaluationDefinition, EvaluationEvidence, EvaluationScope } from "./types.js";

interface ScopeBucket {
	definitions: Map<string, EvaluationDefinition>;
	attempts: EvaluationAttempt[];
	evidence: Map<string, EvaluationEvidence>;
}

export class InMemoryEvaluationStore implements EvaluationStore {
	private readonly buckets = new Map<string, ScopeBucket>();

	private bucket(scope: EvaluationScope): ScopeBucket {
		const key = scopeKey(scope);
		let bucket = this.buckets.get(key);
		if (!bucket) {
			bucket = { definitions: new Map(), attempts: [], evidence: new Map() };
			this.buckets.set(key, bucket);
		}
		return bucket;
	}

	async listDefinitions(scope: EvaluationScope): Promise<readonly EvaluationDefinition[]> {
		return [...this.bucket(scope).definitions.values()].sort((left, right) => left.title.localeCompare(right.title));
	}

	async getDefinition(scope: EvaluationScope, definitionId: string): Promise<EvaluationDefinition | undefined> {
		return this.bucket(scope).definitions.get(definitionId);
	}

	async upsertDefinition(scope: EvaluationScope, definition: EvaluationDefinition): Promise<EvaluationDefinition> {
		this.bucket(scope).definitions.set(definition.id, definition);
		return definition;
	}

	async listAttempts(scope: EvaluationScope): Promise<readonly EvaluationAttempt[]> {
		return [...this.bucket(scope).attempts].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
	}

	async getAttempt(scope: EvaluationScope, attemptId: string): Promise<EvaluationAttempt | undefined> {
		return this.bucket(scope).attempts.find((attempt) => attempt.id === attemptId);
	}

	async findAttemptByFingerprint(scope: EvaluationScope, fingerprint: string): Promise<EvaluationAttempt | undefined> {
		return this.bucket(scope).attempts.find(
			(attempt) =>
				attempt.inputFingerprint === fingerprint &&
				attempt.outcome.kind !== "cancelled" &&
				attempt.outcome.kind !== "budget-limited",
		);
	}

	async appendAttempt(attempt: EvaluationAttempt): Promise<void> {
		const bucket = this.bucket(attempt.scope);
		if (bucket.attempts.some((existing) => existing.id === attempt.id)) {
			throw new EvaluationError("immutable", `Evaluation attempt ${attempt.id} is immutable`);
		}
		bucket.attempts.push(attempt);
	}

	async putEvidence(scope: EvaluationScope, evidence: EvaluationEvidence): Promise<void> {
		this.bucket(scope).evidence.set(evidence.id, evidence);
	}

	async getEvidence(scope: EvaluationScope, evidenceId: string): Promise<EvaluationEvidence | undefined> {
		return this.bucket(scope).evidence.get(evidenceId);
	}

	async listEvidence(scope: EvaluationScope, evidenceIds: readonly string[]): Promise<readonly EvaluationEvidence[]> {
		const bucket = this.bucket(scope);
		return evidenceIds.flatMap((id) => {
			const item = bucket.evidence.get(id);
			return item ? [item] : [];
		});
	}

	clear(scope?: EvaluationScope): void {
		if (!scope) {
			this.buckets.clear();
			return;
		}
		this.buckets.delete(scopeKey(scope));
	}

	hasScope(scope: EvaluationScope): boolean {
		return this.buckets.has(scopeKey(scope));
	}

	same(left: EvaluationScope, right: EvaluationScope): boolean {
		return sameScope(left, right);
	}
}
