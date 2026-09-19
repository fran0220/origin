import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { evaluationOperationsFromService } from "@vetta/coding-agent/composition";
import { getAgentDir } from "@vetta/coding-agent/config";
import {
	CompositeEvaluationEvidenceProvider,
	type EvaluationEvidenceProvider,
	type EvaluationScope,
	EvaluationService,
	type EvaluationTrigger,
	HOME_PROJECT_KEY,
} from "@vetta/runtime-evaluation";
import { FileCheckpointStore } from "@vetta/runtime-node/checkpoints";
import {
	createArtifactDigestEvidenceProvider,
	createNodeVerifierRunner,
	createTraceEvidenceProvider,
	FileEvaluationStore,
} from "@vetta/runtime-node/evaluation";
import { resolveAccountScopedDirForHost } from "../connections/account-directory.js";
import { getAppLogger } from "../logger.js";
import {
	resolveCapabilityProject,
	resolveDesktopCapabilityProjectKeysForEvaluationScope,
} from "../projects/capability-project.js";
import { createPlatformEvaluationEvidenceProvider } from "./platform-evidence.js";

const log = getAppLogger("evaluation");

let shared: { root: string; service: EvaluationService } | undefined;
const extraProviders: EvaluationEvidenceProvider[] = [];

export function evaluationProjectKey(cwd: string): string {
	const scope = resolveDesktopEvaluationScope(cwd);
	return scope.kind === "global" ? HOME_PROJECT_KEY : scope.projectKey;
}

export function resolveDesktopEvaluationScope(cwd: string): EvaluationScope {
	return resolveCapabilityProject(cwd, []).evaluationScope;
}

function parseTriggerRef(trigger: EvaluationTrigger): string | undefined {
	return trigger.ref;
}

export function createDesktopEvaluationService(): EvaluationService {
	const root = resolveAccountScopedDirForHost("evaluation");
	if (shared?.root === root) return shared.service;
	shared?.service.cancel();
	// Pin all roots for the lifetime of this service, including an in-flight run during account switching.
	const checkpointRoot = resolveAccountScopedDirForHost("checkpoints");
	const recordingRoot = resolveAccountScopedDirForHost("recordings");
	const store = new FileEvaluationStore({ rootDir: root });
	const evidenceProvider = new CompositeEvaluationEvidenceProvider([
		createPlatformEvaluationEvidenceProvider({
			resolveProject: resolveDesktopCapabilityProjectKeysForEvaluationScope,
			checkpoints: () => new FileCheckpointStore({ checkpointRoot }),
			recordingRoot: () => recordingRoot,
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
	const service = new EvaluationService({
		store,
		evidenceProvider,
		verifierRunner: createNodeVerifierRunner(),
	});
	shared = { root, service };
	return service;
}

export function getDesktopEvaluationOperations(): ReturnType<typeof evaluationOperationsFromService> {
	return {
		listDefinitions: (scope) => createDesktopEvaluationService().listDefinitions(scope),
		listAttempts: (scope) => createDesktopEvaluationService().listAttempts(scope),
		get: (scope, attemptId) => createDesktopEvaluationService().get(scope, attemptId),
		run: (input) => createDesktopEvaluationService().run(input),
	};
}

export function registerDesktopEvaluationEvidenceProvider(provider: EvaluationEvidenceProvider): () => void {
	extraProviders.push(provider);
	return () => {
		const index = extraProviders.indexOf(provider);
		if (index >= 0) extraProviders.splice(index, 1);
	};
}
