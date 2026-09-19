import { MAX_EVIDENCE_PER_ATTEMPT } from "./constants.js";
import { EvaluationError } from "./errors.js";
import type { EvaluationDefinition, EvaluationEvidence, EvaluationTrigger, UpsertDefinitionInput } from "./types.js";

export function validateDefinition(definition: EvaluationDefinition): void {
	if (definition.id.trim().length === 0 || definition.criteria.length === 0) {
		throw new EvaluationError("invalid-definition", "the Evaluation definition has no identity or criteria");
	}
	const ids = new Set<string>();
	for (const criterion of definition.criteria) {
		if (criterion.id.trim().length === 0 || ids.has(criterion.id)) {
			throw new EvaluationError(
				"invalid-definition",
				"the Evaluation definition has duplicate or blank criterion identities",
			);
		}
		ids.add(criterion.id);
		if (criterion.title.trim().length === 0) {
			throw new EvaluationError("invalid-definition", "the Evaluation definition has a blank criterion title");
		}
	}
}

export function validateUpsertInput(input: UpsertDefinitionInput): void {
	if (input.title.trim().length === 0) {
		throw new EvaluationError("invalid-definition", "the Evaluation definition has no title");
	}
	if (input.criteria.length === 0) {
		throw new EvaluationError("invalid-definition", "the Evaluation definition has no criteria");
	}
}

export function validateEvidence(evidence: readonly EvaluationEvidence[]): void {
	if (evidence.length > MAX_EVIDENCE_PER_ATTEMPT) {
		throw new EvaluationError(
			"unavailable",
			`an Evaluation attempt may cite at most ${MAX_EVIDENCE_PER_ATTEMPT} evidence records`,
		);
	}
	const ids = new Set<string>();
	for (const item of evidence) {
		if (item.id.trim().length === 0 || item.digest.trim().length === 0 || item.capturedAt.trim().length === 0) {
			throw new EvaluationError(
				"unavailable",
				"Evaluation evidence has a duplicate or blank identity, digest, or capture time",
			);
		}
		if (ids.has(item.id)) {
			throw new EvaluationError(
				"unavailable",
				"Evaluation evidence has a duplicate or blank identity, digest, or capture time",
			);
		}
		ids.add(item.id);
	}
}

export function validateTrigger(trigger: EvaluationTrigger): void {
	if (trigger.kind !== "manual" && (trigger.ref === undefined || trigger.ref.trim().length === 0)) {
		throw new EvaluationError("unavailable", "this Evaluation trigger requires a reference");
	}
}
