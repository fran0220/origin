// Shared Desktop host services used by the production Agent Runtime composition.
import { join } from "node:path";
import { CONFIG_DIR_NAME, getAgentDir } from "@vetta/coding-agent/config";
import { SIGNED_IN_CONNECTION_ID } from "@vetta/coding-agent/connections";
import {
	AuthStorage,
	type CodingAgentAuthRuntime,
	type CodingAgentModelRuntime,
	createCodingAgentModelRuntime,
	SettingsRuntime,
} from "@vetta/coding-agent/host-services";
import {
	NodeScopedTextStorage,
	NodeTransactionalTextStorage,
	nodeConfigurationValueResolver,
	nodeSyncTextFileSource,
} from "@vetta/runtime-node/host";
import { getConnectionRelayRoute } from "../connections/relay-host.js";
import { DEFAULT_SERVER_URL } from "../constants.js";
import { getDesktopModelCredentialStore, type ModelCredentialStore } from "../models/model-credential-store.js";
import { readModelsConfigSync } from "../models/model-settings-service.js";

let sharedModelRuntime: CodingAgentModelRuntime | undefined;
let sharedModelAuth: CodingAgentAuthRuntime | undefined;
let syncedCredentialProviderIds = new Set<string>();

export function getOrCreateSharedModelRuntime(): CodingAgentModelRuntime {
	if (sharedModelRuntime) return sharedModelRuntime;
	const agentDir = getAgentDir();
	const authStorage = AuthStorage.fromStorage(new NodeTransactionalTextStorage(join(agentDir, "auth.json")), {
		configurationValueResolver: nodeConfigurationValueResolver,
	});
	sharedModelAuth = authStorage;
	syncSharedModelRuntimeCredentials(getDesktopModelCredentialStore(), readModelsConfigSync().providers);
	const runtime = createCodingAgentModelRuntime(authStorage, {
		modelsJsonPath: join(agentDir, "models.json"),
		configFileSource: nodeSyncTextFileSource,
		configurationValueResolver: nodeConfigurationValueResolver,
	});
	const signedIn = getConnectionRelayRoute(SIGNED_IN_CONNECTION_ID);
	runtime.setServerUrl(signedIn ? `${signedIn.origin}${signedIn.prefixes[0] ?? ""}` : DEFAULT_SERVER_URL);
	runtime.setServerToken(signedIn?.bearer);
	runtime.setServerTokenGetter(() => getConnectionRelayRoute(SIGNED_IN_CONNECTION_ID)?.bearer);
	void runtime.loadRemoteModels();
	sharedModelRuntime = runtime;
	return runtime;
}

export function syncSharedModelRuntimeCredentials(
	credentials: ModelCredentialStore,
	providers: Record<string, { credentialRef?: string }>,
): void {
	const auth = sharedModelAuth;
	if (!auth) return;
	const nextProviderIds = new Set<string>();
	for (const [providerId, provider] of Object.entries(providers)) {
		if (!provider.credentialRef) continue;
		const apiKey = credentials.get(provider.credentialRef);
		if (!apiKey) continue;
		auth.setRuntimeApiKey(providerId, apiKey);
		nextProviderIds.add(providerId);
	}
	for (const providerId of syncedCredentialProviderIds) {
		if (!nextProviderIds.has(providerId)) auth.removeRuntimeApiKey(providerId);
	}
	syncedCredentialProviderIds = nextProviderIds;
}

export function readDesktopMcpDebug(cwd: string, agentDir: string): boolean {
	return SettingsRuntime.fromStorage(
		new NodeScopedTextStorage({
			global: join(agentDir, "settings.json"),
			project: join(cwd, CONFIG_DIR_NAME, "settings.json"),
		}),
	).getMcpDebug();
}
