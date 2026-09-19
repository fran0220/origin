import type {
	EvaluationAttempt,
	EvaluationAttemptView,
	EvaluationDefinition,
	EvaluationScope,
	EvaluationTrigger,
	UpsertDefinitionInput,
} from "@origin/runtime-evaluation";
import { createDesktopEvaluationService } from "./desktop-evaluation-runtime.js";

export function listEvaluationDefinitions(scope: EvaluationScope): Promise<readonly EvaluationDefinition[]> {
	return createDesktopEvaluationService().listDefinitions(scope);
}

export function upsertEvaluationDefinition(
	scope: EvaluationScope,
	input: UpsertDefinitionInput,
): Promise<EvaluationDefinition> {
	return createDesktopEvaluationService().upsertDefinition(scope, input);
}

export function listEvaluationAttempts(scope: EvaluationScope): Promise<readonly EvaluationAttempt[]> {
	return createDesktopEvaluationService().listAttempts(scope);
}

export function getEvaluation(scope: EvaluationScope, attemptId: string): Promise<EvaluationAttemptView> {
	return createDesktopEvaluationService().get(scope, attemptId);
}

export function runEvaluation(input: {
	readonly scope: EvaluationScope;
	readonly definitionId: string;
	readonly trigger: EvaluationTrigger;
}): Promise<EvaluationAttempt> {
	return createDesktopEvaluationService().run(input);
}

export function cancelEvaluation(): void {
	createDesktopEvaluationService().cancel();
}
