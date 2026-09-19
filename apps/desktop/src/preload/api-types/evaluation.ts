import type {
	EvaluationAttempt,
	EvaluationAttemptView,
	EvaluationDefinition,
	EvaluationEvidence,
	EvaluationScope,
	EvaluationTrigger,
	UpsertCriterionInput,
	UpsertDefinitionInput,
} from "@origin/runtime-evaluation";

export type {
	EvaluationAttempt,
	EvaluationAttemptView,
	EvaluationDefinition,
	EvaluationEvidence,
	EvaluationScope,
	EvaluationTrigger,
	UpsertCriterionInput,
	UpsertDefinitionInput,
};

export interface DesktopEvaluationEvidenceProviderRequest {
	readonly requestId: string;
	readonly providerId: string;
	readonly scopeKey: string;
	readonly trigger: EvaluationTrigger;
}

export interface DesktopEvaluationApi {
	listDefinitions(scope: EvaluationScope): Promise<readonly EvaluationDefinition[]>;
	upsertDefinition(scope: EvaluationScope, input: UpsertDefinitionInput): Promise<EvaluationDefinition>;
	listAttempts(scope: EvaluationScope): Promise<readonly EvaluationAttempt[]>;
	get(scope: EvaluationScope, attemptId: string): Promise<EvaluationAttemptView>;
	run(scope: EvaluationScope, definitionId: string, trigger?: EvaluationTrigger): Promise<EvaluationAttempt>;
	cancel(): Promise<void>;
	registerEvidenceProvider(providerId: string, kind: string): Promise<void>;
	unregisterEvidenceProvider(providerId: string): Promise<void>;
	onEvidenceProviderRequest(handler: (request: DesktopEvaluationEvidenceProviderRequest) => void): () => void;
	respondEvidenceProvider(
		requestId: string,
		result: readonly EvaluationEvidence[] | { readonly error: string },
	): Promise<void>;
}
