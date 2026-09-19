import { randomUUID } from "node:crypto";
import type {
	AssertionVerifierRef,
	CommandVerifierRef,
	EvaluationEvidence,
	EvaluationScope,
	EvaluationTrigger,
	UpsertDefinitionInput,
	VerifierRef,
} from "@vetta/runtime-evaluation";
import { type IpcMainInvokeEvent, ipcMain, type WebContents } from "electron";
import { registerDesktopEvaluationEvidenceProvider } from "../evaluation/desktop-evaluation-runtime.js";
import {
	cancelEvaluation,
	getEvaluation,
	listEvaluationAttempts,
	listEvaluationDefinitions,
	runEvaluation,
	upsertEvaluationDefinition,
} from "../evaluation/evaluation-service.js";

export const EVALUATION_CHANNELS = {
	LIST_DEFINITIONS: "vetta:evaluation:list-definitions",
	UPSERT_DEFINITION: "vetta:evaluation:upsert-definition",
	LIST_ATTEMPTS: "vetta:evaluation:list-attempts",
	GET: "vetta:evaluation:get",
	RUN: "vetta:evaluation:run",
	CANCEL: "vetta:evaluation:cancel",
	REGISTER_PROVIDER: "vetta:evaluation:register-provider",
	UNREGISTER_PROVIDER: "vetta:evaluation:unregister-provider",
	PROVIDER_RESPONSE: "vetta:evaluation:provider-response",
	PROVIDER_REQUEST: "vetta:evaluation:provider-request",
} as const;

function requireScope(value: unknown): EvaluationScope {
	if (!value || typeof value !== "object") throw new Error("scope is required");
	const scope = value as { kind?: unknown; projectKey?: unknown };
	if (scope.kind === "global") return { kind: "global" };
	if (scope.kind === "project" && typeof scope.projectKey === "string" && scope.projectKey.length > 0) {
		return { kind: "project", projectKey: scope.projectKey };
	}
	throw new Error("scope is invalid");
}

function requireTrigger(value: unknown): EvaluationTrigger {
	if (!value || typeof value !== "object") return { kind: "manual" };
	const trigger = value as { kind?: unknown; ref?: unknown };
	if (
		trigger.kind !== "turn" &&
		trigger.kind !== "checkpoint" &&
		trigger.kind !== "milestone" &&
		trigger.kind !== "manual"
	) {
		throw new Error("trigger is invalid");
	}
	return {
		kind: trigger.kind,
		...(typeof trigger.ref === "string" ? { ref: trigger.ref } : {}),
	};
}

function requireVerifier(value: unknown): VerifierRef {
	if (!value || typeof value !== "object") throw new Error("verifier is invalid");
	const verifier = value as {
		kind?: unknown;
		command?: unknown;
		args?: unknown;
		cwd?: unknown;
		timeoutMs?: unknown;
		source?: unknown;
		expression?: unknown;
	};
	if (verifier.kind === "command") {
		if (typeof verifier.command !== "string" || verifier.command.trim().length === 0) {
			throw new Error("command verifier requires a command");
		}
		const command: CommandVerifierRef = {
			kind: "command",
			command: verifier.command,
			...(Array.isArray(verifier.args) && verifier.args.every((arg) => typeof arg === "string")
				? { args: verifier.args }
				: {}),
			...(typeof verifier.cwd === "string" ? { cwd: verifier.cwd } : {}),
			...(typeof verifier.timeoutMs === "number" && verifier.timeoutMs > 0 ? { timeoutMs: verifier.timeoutMs } : {}),
		};
		return command;
	}
	if (verifier.kind === "assertion") {
		if (verifier.source !== "recording-telemetry" || typeof verifier.expression !== "string") {
			throw new Error("assertion verifier is invalid");
		}
		const assertion: AssertionVerifierRef = {
			kind: "assertion",
			source: "recording-telemetry",
			expression: verifier.expression,
		};
		return assertion;
	}
	throw new Error("verifier is invalid");
}

function requireUpsert(value: unknown): UpsertDefinitionInput {
	if (!value || typeof value !== "object") throw new Error("definition is required");
	const input = value as {
		id?: unknown;
		title?: unknown;
		criteria?: unknown;
	};
	if (typeof input.title !== "string" || input.title.trim().length === 0) throw new Error("title is required");
	if (!Array.isArray(input.criteria) || input.criteria.length === 0) throw new Error("criteria are required");
	return {
		...(typeof input.id === "string" ? { id: input.id } : {}),
		title: input.title,
		criteria: input.criteria.map((criterion) => {
			if (!criterion || typeof criterion !== "object") throw new Error("criterion is invalid");
			const item = criterion as { id?: unknown; title?: unknown; required?: unknown; verifier?: unknown };
			if (typeof item.title !== "string" || typeof item.required !== "boolean") {
				throw new Error("criterion is invalid");
			}
			return {
				...(typeof item.id === "string" ? { id: item.id } : {}),
				title: item.title,
				required: item.required,
				...(item.verifier ? { verifier: requireVerifier(item.verifier) } : {}),
			};
		}),
	};
}

interface PendingProviderCapture {
	resolve: (evidence: readonly EvaluationEvidence[]) => void;
	reject: (error: Error) => void;
}

const pendingProviderCaptures = new Map<string, PendingProviderCapture>();
const registeredProviders = new Map<string, () => void>();

function parseEvidenceList(value: unknown): EvaluationEvidence[] {
	if (!Array.isArray(value)) return [];
	const evidence: EvaluationEvidence[] = [];
	for (const item of value) {
		if (!item || typeof item !== "object") continue;
		const record = item as {
			id?: unknown;
			source?: unknown;
			capturedAt?: unknown;
			digest?: unknown;
			summary?: unknown;
		};
		if (typeof record.id !== "string" || typeof record.capturedAt !== "string") continue;
		if (typeof record.digest !== "string" || typeof record.summary !== "string") continue;
		if (!record.source || typeof record.source !== "object") continue;
		const source = record.source as { kind?: unknown };
		if (
			source.kind !== "execution-receipt" &&
			source.kind !== "checkpoint" &&
			source.kind !== "recording" &&
			source.kind !== "trace" &&
			source.kind !== "artifact"
		) {
			continue;
		}
		evidence.push({
			id: record.id,
			source: record.source as EvaluationEvidence["source"],
			capturedAt: record.capturedAt,
			digest: record.digest,
			summary: record.summary,
		});
	}
	return evidence;
}

export function registerEvaluationIpc(): () => void {
	ipcMain.handle(EVALUATION_CHANNELS.LIST_DEFINITIONS, async (_event: IpcMainInvokeEvent, scope: unknown) =>
		listEvaluationDefinitions(requireScope(scope)),
	);
	ipcMain.handle(
		EVALUATION_CHANNELS.UPSERT_DEFINITION,
		async (_event: IpcMainInvokeEvent, scope: unknown, input: unknown) =>
			upsertEvaluationDefinition(requireScope(scope), requireUpsert(input)),
	);
	ipcMain.handle(EVALUATION_CHANNELS.LIST_ATTEMPTS, async (_event: IpcMainInvokeEvent, scope: unknown) =>
		listEvaluationAttempts(requireScope(scope)),
	);
	ipcMain.handle(EVALUATION_CHANNELS.GET, async (_event: IpcMainInvokeEvent, scope: unknown, attemptId: unknown) => {
		if (typeof attemptId !== "string" || attemptId.length === 0) throw new Error("attemptId is required");
		return getEvaluation(requireScope(scope), attemptId);
	});
	ipcMain.handle(
		EVALUATION_CHANNELS.RUN,
		async (_event: IpcMainInvokeEvent, scope: unknown, definitionId: unknown, trigger: unknown) => {
			if (typeof definitionId !== "string" || definitionId.length === 0) throw new Error("definitionId is required");
			return runEvaluation({
				scope: requireScope(scope),
				definitionId,
				trigger: requireTrigger(trigger),
			});
		},
	);
	ipcMain.handle(EVALUATION_CHANNELS.CANCEL, async () => {
		cancelEvaluation();
	});
	ipcMain.handle(
		EVALUATION_CHANNELS.REGISTER_PROVIDER,
		(_event: IpcMainInvokeEvent, providerId: unknown, kind: unknown) => {
			if (typeof providerId !== "string" || providerId.length === 0) throw new Error("providerId is required");
			if (typeof kind !== "string" || kind.trim().length === 0) throw new Error("provider kind is required");
			registeredProviders.get(providerId)?.();
			const sender = _event.sender;
			const dispose = registerDesktopEvaluationEvidenceProvider({
				kind,
				async capture(scopeKey, trigger) {
					return { evidence: await requestPluginEvidence(sender, providerId, scopeKey, trigger) };
				},
			});
			registeredProviders.set(providerId, dispose);
		},
	);
	ipcMain.handle(EVALUATION_CHANNELS.UNREGISTER_PROVIDER, (_event: IpcMainInvokeEvent, providerId: unknown) => {
		if (typeof providerId !== "string" || providerId.length === 0) throw new Error("providerId is required");
		registeredProviders.get(providerId)?.();
		registeredProviders.delete(providerId);
	});
	ipcMain.handle(
		EVALUATION_CHANNELS.PROVIDER_RESPONSE,
		(_event: IpcMainInvokeEvent, requestId: unknown, result: unknown) => {
			if (typeof requestId !== "string") throw new Error("requestId is required");
			const pending = pendingProviderCaptures.get(requestId);
			if (!pending) return;
			pendingProviderCaptures.delete(requestId);
			if (result && typeof result === "object" && "error" in result) {
				const error = (result as { error?: unknown }).error;
				pending.reject(new Error(typeof error === "string" ? error : "plugin evidence provider failed"));
				return;
			}
			pending.resolve(parseEvidenceList(result));
		},
	);

	return () => {
		for (const channel of Object.values(EVALUATION_CHANNELS)) ipcMain.removeHandler(channel);
		for (const dispose of registeredProviders.values()) dispose();
		registeredProviders.clear();
		for (const pending of pendingProviderCaptures.values()) pending.reject(new Error("evaluation ipc disposed"));
		pendingProviderCaptures.clear();
	};
}

function requestPluginEvidence(
	sender: WebContents,
	providerId: string,
	scopeKey: string,
	trigger: EvaluationTrigger,
): Promise<readonly EvaluationEvidence[]> {
	if (sender.isDestroyed()) return Promise.resolve([]);
	const requestId = randomUUID();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			pendingProviderCaptures.delete(requestId);
			resolve([]);
		}, 15_000);
		pendingProviderCaptures.set(requestId, {
			resolve: (evidence) => {
				clearTimeout(timer);
				resolve(evidence);
			},
			reject: (error) => {
				clearTimeout(timer);
				reject(error);
			},
		});
		sender.send(EVALUATION_CHANNELS.PROVIDER_REQUEST, { requestId, providerId, scopeKey, trigger });
	});
}
