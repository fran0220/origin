import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluationOperationsFromService } from "@vetta/coding-agent/composition";
import { getAgentDir } from "@vetta/coding-agent/config";
import {
	CompositeEvaluationEvidenceProvider,
	type EvaluationEvidenceProvider,
	type EvaluationScope,
	EvaluationService,
	type EvaluationTrigger,
	HOME_PROJECT_KEY,
} from "@vetta/runtime-evaluation";
import {
	createArtifactDigestEvidenceProvider,
	createCheckpointEvidenceProvider,
	createExecutionReceiptEvidenceProvider,
	createNodeVerifierRunner,
	createRecordingEvidenceProvider,
	createTraceEvidenceProvider,
	FileEvaluationStore,
} from "@vetta/runtime-node/evaluation";
import { DEFAULT_CONVERSATION_CWD } from "../config/desktop-config-store.js";
import { getAppLogger } from "../logger.js";

const log = getAppLogger("evaluation");

let shared: EvaluationService | undefined;
const extraProviders: EvaluationEvidenceProvider[] = [];

export function evaluationProjectKey(cwd: string): string {
	if (!cwd || cwd === DEFAULT_CONVERSATION_CWD) return HOME_PROJECT_KEY;
	return createHash("sha256").update(cwd).digest("hex").slice(0, 16);
}

export function resolveDesktopEvaluationScope(cwd: string): EvaluationScope {
	const projectKey = evaluationProjectKey(cwd);
	if (projectKey === HOME_PROJECT_KEY) return { kind: "global" };
	return { kind: "project", projectKey };
}

function parseTriggerRef(trigger: EvaluationTrigger): string | undefined {
	return trigger.ref;
}

export function createDesktopEvaluationService(): EvaluationService {
	if (shared) return shared;
	const store = new FileEvaluationStore({
		rootDir: () => join(getAgentDir(), "evaluation"),
	});
	const evidenceProvider = new CompositeEvaluationEvidenceProvider([
		createExecutionReceiptEvidenceProvider({
			async list(_scopeKey, trigger) {
				void trigger;
				return [];
			},
		}),
		createCheckpointEvidenceProvider({
			async list(_scopeKey, trigger) {
				void trigger;
				return [];
			},
		}),
		createTraceEvidenceProvider({
			async list(_scopeKey, trigger) {
				const sessionId = parseTriggerRef(trigger);
				if (!sessionId) return [];
				try {
					const { createDesktopAgentObservability } = await import("../agent-observability/composition.js");
					const observability = createDesktopAgentObservability(getAgentDir(), log);
					const page = await observability.query({ sessionId, limit: 50 });
					return page.records.map((record) => ({
						id: record.id,
						traceId: record.traceId,
						name: record.name,
						state: record.state,
						startedAt: record.startedAt,
						sessionId: record.context.sessionId,
					}));
				} catch (error) {
					log.warn("[evaluation] trace capture failed", error);
					return [];
				}
			},
		}),
		createArtifactDigestEvidenceProvider({
			async list(_scopeKey, trigger) {
				const path = parseTriggerRef(trigger);
				if (!path) return [];
				try {
					const bytes = await readFile(path);
					const digest = createHash("sha256").update(bytes).digest("hex");
					return [
						{
							artifactId: digest.slice(0, 16),
							digest,
							path,
							summary: `artifact ${path}`,
						},
					];
				} catch {
					return [];
				}
			},
		}),
		createRecordingEvidenceProvider(),
		{
			kind: "plugin",
			async capture(scopeKey, trigger) {
				const evidence = [];
				for (const provider of extraProviders) {
					const captured = await provider.capture(scopeKey, trigger);
					evidence.push(...captured.evidence);
				}
				return { evidence };
			},
		},
	]);
	shared = new EvaluationService({
		store,
		evidenceProvider,
		verifierRunner: createNodeVerifierRunner(),
	});
	return shared;
}

export function getDesktopEvaluationOperations() {
	return evaluationOperationsFromService(createDesktopEvaluationService());
}

export function registerDesktopEvaluationEvidenceProvider(provider: EvaluationEvidenceProvider): () => void {
	extraProviders.push(provider);
	return () => {
		const index = extraProviders.indexOf(provider);
		if (index >= 0) extraProviders.splice(index, 1);
	};
}
