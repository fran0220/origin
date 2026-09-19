import type { IpcRenderer } from "electron";
import type { DesktopApi } from "../api.js";
import type { DesktopEvaluationEvidenceProviderRequest } from "../api-types/evaluation.js";

const CHANNELS = {
	LIST_DEFINITIONS: "origin:evaluation:list-definitions",
	UPSERT_DEFINITION: "origin:evaluation:upsert-definition",
	LIST_ATTEMPTS: "origin:evaluation:list-attempts",
	GET: "origin:evaluation:get",
	RUN: "origin:evaluation:run",
	CANCEL: "origin:evaluation:cancel",
	REGISTER_PROVIDER: "origin:evaluation:register-provider",
	UNREGISTER_PROVIDER: "origin:evaluation:unregister-provider",
	PROVIDER_RESPONSE: "origin:evaluation:provider-response",
	PROVIDER_REQUEST: "origin:evaluation:provider-request",
} as const;

export function createEvaluationApi(ipc: IpcRenderer): Pick<DesktopApi, "evaluation"> {
	return {
		evaluation: {
			listDefinitions: (scope) => ipc.invoke(CHANNELS.LIST_DEFINITIONS, scope),
			upsertDefinition: (scope, input) => ipc.invoke(CHANNELS.UPSERT_DEFINITION, scope, input),
			listAttempts: (scope) => ipc.invoke(CHANNELS.LIST_ATTEMPTS, scope),
			get: (scope, attemptId) => ipc.invoke(CHANNELS.GET, scope, attemptId),
			run: (scope, definitionId, trigger) => ipc.invoke(CHANNELS.RUN, scope, definitionId, trigger),
			cancel: () => ipc.invoke(CHANNELS.CANCEL),
			registerEvidenceProvider: (providerId, kind) => ipc.invoke(CHANNELS.REGISTER_PROVIDER, providerId, kind),
			unregisterEvidenceProvider: (providerId) => ipc.invoke(CHANNELS.UNREGISTER_PROVIDER, providerId),
			onEvidenceProviderRequest: (handler) => {
				const listener = (_event: unknown, request: DesktopEvaluationEvidenceProviderRequest): void => {
					handler(request);
				};
				ipc.on(CHANNELS.PROVIDER_REQUEST, listener);
				return () => {
					ipc.off(CHANNELS.PROVIDER_REQUEST, listener);
				};
			},
			respondEvidenceProvider: (requestId, result) => ipc.invoke(CHANNELS.PROVIDER_RESPONSE, requestId, result),
		},
	};
}
