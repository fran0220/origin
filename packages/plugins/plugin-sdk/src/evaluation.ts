import type { Disposable } from "./disposable.js";

export type PluginEvaluationTriggerKind = "turn" | "checkpoint" | "milestone" | "manual";

export interface PluginEvaluationTrigger {
	readonly kind: PluginEvaluationTriggerKind;
	readonly ref?: string;
}

export interface PluginEvaluationScope {
	readonly kind: "global" | "project";
	readonly projectKey?: string;
}

export interface PluginEvaluationRunRequest {
	readonly definitionId: string;
	readonly trigger?: PluginEvaluationTrigger;
	readonly scope?: PluginEvaluationScope;
}

export interface PluginEvaluationFinding {
	readonly criterionId: string;
	readonly state: "passed" | "failed" | "inconclusive" | "error";
	readonly evidenceIds: readonly string[];
	readonly note?: string;
}

export interface PluginEvaluationOutcome {
	readonly kind: "passed" | "failed" | "inconclusive" | "error" | "cancelled" | "budget-limited";
	readonly settledAt: string;
}

export interface PluginEvaluationAttempt {
	readonly id: string;
	readonly definitionId: string;
	readonly definitionRevision: number;
	readonly trigger: PluginEvaluationTrigger;
	readonly inputFingerprint: string;
	readonly evidenceIds: readonly string[];
	readonly findings: readonly PluginEvaluationFinding[];
	readonly outcome: PluginEvaluationOutcome;
	readonly createdAt: string;
}

export type PluginEvaluationEvidenceSource =
	| { readonly kind: "execution-receipt"; readonly executionId: string; readonly projectKey?: string }
	| { readonly kind: "checkpoint"; readonly checkpointId: string; readonly projectKey: string }
	| {
			readonly kind: "recording";
			readonly recordingId: string;
			readonly projectKey: string;
			readonly sampleAtMs?: number;
			readonly telemetryPath?: string;
	  }
	| { readonly kind: "trace"; readonly traceId: string; readonly spanId?: string; readonly sessionId?: string }
	| { readonly kind: "artifact"; readonly artifactId: string; readonly digest: string; readonly path?: string };

export interface PluginEvaluationEvidence {
	readonly id: string;
	readonly source: PluginEvaluationEvidenceSource;
	readonly capturedAt: string;
	readonly digest: string;
	readonly summary: string;
}

export interface PluginEvaluationEvidenceCapture {
	readonly evidence: readonly PluginEvaluationEvidence[];
}

export interface PluginEvaluationEvidenceProvider {
	readonly kind: string;
	capture(scopeKey: string, trigger: PluginEvaluationTrigger): Promise<PluginEvaluationEvidenceCapture>;
}

export interface PluginEvaluationDefinition {
	readonly id: string;
	readonly revision: number;
	readonly title: string;
	readonly criteria: readonly {
		readonly id: string;
		readonly title: string;
		readonly required: boolean;
	}[];
	readonly updatedAt: string;
}

export interface PluginEvaluationAttemptView {
	readonly attempt: PluginEvaluationAttempt;
	readonly definition: PluginEvaluationDefinition;
	readonly evidence: readonly PluginEvaluationEvidence[];
}

export interface PluginEvaluationApi {
	run(request: PluginEvaluationRunRequest): Promise<PluginEvaluationAttempt>;
	listDefinitions(scope?: PluginEvaluationScope): Promise<readonly PluginEvaluationDefinition[]>;
	listAttempts(scope?: PluginEvaluationScope): Promise<readonly PluginEvaluationAttempt[]>;
	get(attemptId: string, scope?: PluginEvaluationScope): Promise<PluginEvaluationAttemptView>;
	registerEvidenceProvider(provider: PluginEvaluationEvidenceProvider): Disposable;
}
