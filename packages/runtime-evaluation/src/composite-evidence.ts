import { MAX_EVIDENCE_PER_ATTEMPT } from "./constants.js";
import { EvaluationError } from "./errors.js";
import type { EvaluationCapture, EvaluationEvidenceProvider } from "./ports.js";
import type { EvaluationEvidence, EvaluationTrigger } from "./types.js";

export class CompositeEvaluationEvidenceProvider implements EvaluationEvidenceProvider {
	readonly kind = "composite";

	constructor(private readonly providers: readonly EvaluationEvidenceProvider[]) {}

	async capture(scopeKey: string, trigger: EvaluationTrigger): Promise<EvaluationCapture> {
		const evidence: EvaluationEvidence[] = [];
		const seen = new Set<string>();
		for (const provider of this.providers) {
			const captured = await provider.capture(scopeKey, trigger);
			for (const item of captured.evidence) {
				if (seen.has(item.id)) continue;
				seen.add(item.id);
				evidence.push(item);
			}
		}
		if (evidence.length > MAX_EVIDENCE_PER_ATTEMPT) {
			throw new EvaluationError(
				"unavailable",
				`an Evaluation attempt may cite at most ${MAX_EVIDENCE_PER_ATTEMPT} evidence records`,
			);
		}
		return { evidence };
	}
}
