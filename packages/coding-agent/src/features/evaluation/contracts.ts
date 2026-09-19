import type {
	EvaluationAttempt,
	EvaluationAttemptView,
	EvaluationDefinition,
	EvaluationScope,
	EvaluationTrigger,
} from "@vetta/runtime-evaluation";

export interface CodingAgentEvaluationOperations {
	listDefinitions(scope: EvaluationScope): Promise<readonly EvaluationDefinition[]>;
	listAttempts(scope: EvaluationScope): Promise<readonly EvaluationAttempt[]>;
	get(scope: EvaluationScope, attemptId: string): Promise<EvaluationAttemptView>;
	run(input: {
		readonly scope: EvaluationScope;
		readonly definitionId: string;
		readonly trigger: EvaluationTrigger;
	}): Promise<EvaluationAttempt>;
}
