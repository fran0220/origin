import type { EvaluationCriterion, EvaluationFinding, EvaluationOutcome, FindingState, OutcomeKind } from "./types.js";

export interface CriterionAssessment {
	readonly criterionId: string;
	readonly state: FindingState;
	readonly evidenceIds: readonly string[];
	readonly note?: string;
}

export function findingsForCriteria(
	criteria: readonly EvaluationCriterion[],
	assessments: readonly CriterionAssessment[],
): EvaluationFinding[] {
	const byId = new Map(assessments.map((assessment) => [assessment.criterionId, assessment]));
	return criteria.map((criterion) => {
		const assessment = byId.get(criterion.id);
		if (!assessment) {
			return {
				criterionId: criterion.id,
				state: "inconclusive",
				evidenceIds: [],
			};
		}
		return {
			criterionId: criterion.id,
			state: assessment.state,
			evidenceIds: assessment.evidenceIds,
			...(assessment.note !== undefined ? { note: assessment.note } : {}),
		};
	});
}

export function aggregateOutcome(
	criteria: readonly EvaluationCriterion[],
	findings: readonly EvaluationFinding[],
	settledAt: string,
	override?: Extract<OutcomeKind, "cancelled" | "budget-limited">,
): EvaluationOutcome {
	if (override) return { kind: override, settledAt };
	const requiredIds = new Set(criteria.filter((criterion) => criterion.required).map((criterion) => criterion.id));
	const requiredFindings = findings.filter((finding) => requiredIds.has(finding.criterionId));
	const kind = settleRequired(requiredFindings);
	return { kind, settledAt };
}

function settleRequired(required: readonly EvaluationFinding[]): Exclude<OutcomeKind, "cancelled" | "budget-limited"> {
	if (required.length === 0) return "inconclusive";
	if (required.some((finding) => finding.state === "error")) return "error";
	if (required.some((finding) => finding.state === "failed")) return "failed";
	if (required.some((finding) => finding.state === "inconclusive")) return "inconclusive";
	if (required.every((finding) => finding.state === "passed")) return "passed";
	return "inconclusive";
}
