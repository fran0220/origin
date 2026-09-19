import { aggregateOutcome, type CriterionAssessment, findingsForCriteria } from "./aggregation.js";
import { createEvaluationClock } from "./default-clock.js";
import { EvaluationError } from "./errors.js";
import { computeInputFingerprint } from "./fingerprint.js";
import type {
	EvaluationClock,
	EvaluationEvidenceProvider,
	EvaluationStore,
	VerifierRunner,
	VerifierRunResult,
} from "./ports.js";
import { scopeKey } from "./scope.js";
import type {
	EvaluationAttempt,
	EvaluationAttemptView,
	EvaluationDefinition,
	EvaluationEvidence,
	EvaluationFinding,
	EvaluationScope,
	RunEvaluationInput,
	UpsertDefinitionInput,
} from "./types.js";
import { validateDefinition, validateEvidence, validateTrigger, validateUpsertInput } from "./validate.js";

export interface EvaluationServiceOptions {
	readonly store: EvaluationStore;
	readonly evidenceProvider: EvaluationEvidenceProvider;
	readonly verifierRunner?: VerifierRunner;
	readonly clock?: EvaluationClock;
}

export class EvaluationService {
	private readonly store: EvaluationStore;
	private readonly evidenceProvider: EvaluationEvidenceProvider;
	private readonly verifierRunner?: VerifierRunner;
	private readonly clock: EvaluationClock;
	private readonly inflight = new Map<string, AbortController>();

	constructor(options: EvaluationServiceOptions) {
		this.store = options.store;
		this.evidenceProvider = options.evidenceProvider;
		this.verifierRunner = options.verifierRunner;
		this.clock = options.clock ?? createEvaluationClock();
	}

	listDefinitions(scope: EvaluationScope): Promise<readonly EvaluationDefinition[]> {
		return this.store.listDefinitions(scope);
	}

	async upsertDefinition(scope: EvaluationScope, input: UpsertDefinitionInput): Promise<EvaluationDefinition> {
		validateUpsertInput(input);
		const existing = input.id ? await this.store.getDefinition(scope, input.id) : undefined;
		const now = this.clock.now().toISOString();
		const definition: EvaluationDefinition = {
			id: existing?.id ?? input.id ?? this.clock.createId("definition"),
			revision: (existing?.revision ?? 0) + 1,
			title: input.title.trim(),
			criteria: input.criteria.map((criterion) => ({
				id: criterion.id?.trim() || this.clock.createId("criterion"),
				title: criterion.title.trim(),
				required: criterion.required,
				...(criterion.verifier ? { verifier: criterion.verifier } : {}),
			})),
			updatedAt: now,
		};
		validateDefinition(definition);
		return this.store.upsertDefinition(scope, definition);
	}

	listAttempts(scope: EvaluationScope): Promise<readonly EvaluationAttempt[]> {
		return this.store.listAttempts(scope);
	}

	async get(scope: EvaluationScope, attemptId: string): Promise<EvaluationAttemptView> {
		const attempt = await this.store.getAttempt(scope, attemptId);
		if (!attempt) throw new EvaluationError("not-found", `Evaluation attempt ${attemptId} was not found`);
		const definition = await this.store.getDefinition(scope, attempt.definitionId);
		if (!definition) {
			throw new EvaluationError("not-found", `Evaluation definition ${attempt.definitionId} was not found`);
		}
		const evidence = await this.store.listEvidence(scope, attempt.evidenceIds);
		return { attempt, definition, evidence };
	}

	async run(input: RunEvaluationInput): Promise<EvaluationAttempt> {
		validateTrigger(input.trigger);
		const definition = await this.store.getDefinition(input.scope, input.definitionId);
		if (!definition) {
			throw new EvaluationError("not-found", `Evaluation definition ${input.definitionId} was not found`);
		}
		validateDefinition(definition);
		const controller = new AbortController();
		if (input.signal?.aborted) {
			throw new EvaluationError("cancelled", "The evaluation was cancelled.");
		}
		const onAbort = (): void => controller.abort();
		input.signal?.addEventListener("abort", onAbort, { once: true });
		const runKey = this.clock.createId("run");
		this.inflight.set(runKey, controller);
		try {
			const captured = await this.evidenceProvider.capture(scopeKey(input.scope), input.trigger);
			this.throwIfAborted(controller.signal);
			if (captured.evidence.length > 256) {
				return this.recordTerminal(input, definition, "budget-limited");
			}
			validateEvidence(captured.evidence);
			const assessmentsAndEvidence = await this.assess(definition, captured.evidence, input, controller.signal);
			this.throwIfAborted(controller.signal);
			const evidence = dedupeEvidence([...captured.evidence, ...assessmentsAndEvidence.evidence]);
			if (evidence.length > 256) {
				return this.recordTerminal(input, definition, "budget-limited");
			}
			validateEvidence(evidence);
			for (const item of evidence) {
				await this.store.putEvidence(input.scope, item);
			}
			const findings = findingsForCriteria(definition.criteria, assessmentsAndEvidence.assessments);
			this.assertFindingsCiteEvidence(findings, evidence);
			const fingerprint = await computeInputFingerprint(
				input.scope,
				definition,
				input.trigger,
				evidence.map((item) => item.id),
			);
			const existing = await this.store.findAttemptByFingerprint(input.scope, fingerprint);
			if (existing && existing.outcome.kind !== "cancelled" && existing.outcome.kind !== "budget-limited") {
				return existing;
			}
			const createdAt = this.clock.now().toISOString();
			const outcome = aggregateOutcome(definition.criteria, findings, createdAt);
			const attempt: EvaluationAttempt = {
				id: this.clock.createId("evaluation"),
				scope: input.scope,
				definitionId: definition.id,
				definitionRevision: definition.revision,
				trigger: input.trigger,
				inputFingerprint: fingerprint,
				evidenceIds: evidence.map((item) => item.id),
				findings,
				outcome,
				createdAt,
			};
			await this.store.appendAttempt(attempt);
			return attempt;
		} catch (error) {
			if (controller.signal.aborted || isCancelled(error)) {
				return this.recordTerminal(input, definition, "cancelled");
			}
			throw error;
		} finally {
			input.signal?.removeEventListener("abort", onAbort);
			this.inflight.delete(runKey);
		}
	}

	cancel(attemptOrRunId?: string): void {
		if (attemptOrRunId) {
			this.inflight.get(attemptOrRunId)?.abort();
			return;
		}
		for (const controller of this.inflight.values()) controller.abort();
	}

	private async assess(
		definition: EvaluationDefinition,
		captured: readonly EvaluationEvidence[],
		input: RunEvaluationInput,
		signal: AbortSignal,
	): Promise<{ assessments: CriterionAssessment[]; evidence: EvaluationEvidence[] }> {
		const assessments: CriterionAssessment[] = [];
		const extra: EvaluationEvidence[] = [];
		for (const criterion of definition.criteria) {
			this.throwIfAborted(signal);
			if (!criterion.verifier) {
				assessments.push(assessmentFromCapturedEvidence(criterion.id, captured));
				continue;
			}
			if (!this.verifierRunner) {
				assessments.push({
					criterionId: criterion.id,
					state: "inconclusive",
					evidenceIds: [],
					note: "No verifier runner is registered for this criterion.",
				});
				continue;
			}
			try {
				const result: VerifierRunResult = await this.verifierRunner.run(criterion.verifier, criterion.id, {
					scope: input.scope,
					trigger: input.trigger,
					evidence: captured,
					signal,
				});
				assessments.push(result.assessment);
				extra.push(...result.evidence);
			} catch (error) {
				if (isCancelled(error) || signal.aborted) throw error;
				assessments.push({
					criterionId: criterion.id,
					state: "error",
					evidenceIds: [],
					note: error instanceof Error ? error.message : String(error),
				});
			}
		}
		return { assessments, evidence: extra };
	}

	private assertFindingsCiteEvidence(
		findings: readonly EvaluationFinding[],
		evidence: readonly EvaluationEvidence[],
	): void {
		const ids = new Set(evidence.map((item) => item.id));
		for (const finding of findings) {
			for (const evidenceId of finding.evidenceIds) {
				if (!ids.has(evidenceId)) {
					throw new EvaluationError(
						"unavailable",
						"an Evaluation assessment is duplicate, names no criterion, or cites missing evidence",
					);
				}
			}
		}
	}

	private async recordTerminal(
		input: RunEvaluationInput,
		definition: EvaluationDefinition,
		kind: "cancelled" | "budget-limited",
	): Promise<EvaluationAttempt> {
		const createdAt = this.clock.now().toISOString();
		const findings = findingsForCriteria(definition.criteria, []);
		const fingerprint = await computeInputFingerprint(input.scope, definition, input.trigger, []);
		const attempt: EvaluationAttempt = {
			id: this.clock.createId("evaluation"),
			scope: input.scope,
			definitionId: definition.id,
			definitionRevision: definition.revision,
			trigger: input.trigger,
			inputFingerprint: fingerprint,
			evidenceIds: [],
			findings,
			outcome: { kind, settledAt: createdAt },
			createdAt,
		};
		await this.store.appendAttempt(attempt);
		return attempt;
	}

	private throwIfAborted(signal: AbortSignal): void {
		if (signal.aborted) throw new EvaluationError("cancelled", "The evaluation was cancelled.");
	}
}

function assessmentFromCapturedEvidence(
	criterionId: string,
	evidence: readonly EvaluationEvidence[],
): CriterionAssessment {
	return {
		criterionId,
		state: "inconclusive",
		evidenceIds: evidence.map((item) => item.id),
		note: "No verifier supplied evidence for this criterion.",
	};
}

function dedupeEvidence(evidence: readonly EvaluationEvidence[]): EvaluationEvidence[] {
	const seen = new Set<string>();
	const result: EvaluationEvidence[] = [];
	for (const item of evidence) {
		if (seen.has(item.id)) continue;
		seen.add(item.id);
		result.push(item);
	}
	return result;
}

function isCancelled(error: unknown): boolean {
	return error instanceof EvaluationError && error.code === "cancelled";
}
