import type { EvaluationService } from "@vetta/runtime-evaluation";
import type { CodingAgentEvaluationOperations } from "../../features/evaluation/contracts.js";

export function evaluationOperationsFromService(service: EvaluationService): CodingAgentEvaluationOperations {
	return {
		listDefinitions: (scope) => service.listDefinitions(scope),
		listAttempts: (scope) => service.listAttempts(scope),
		get: (scope, attemptId) => service.get(scope, attemptId),
		run: (input) => service.run(input),
	};
}
