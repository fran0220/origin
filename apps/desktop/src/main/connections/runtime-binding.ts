import { SIGNED_IN_CONNECTION_ID } from "@vetta/coding-agent/connections";
import type { RelayRoute } from "@vetta/runtime-node/credentials";
import { getOrCreateSharedModelRuntime } from "../agent-runtime/host-services.js";
import { DEFAULT_SERVER_URL } from "../constants.js";
import { syncCredentialFile } from "../credentials/cli-credential-file.js";
import { getConnectionRelayRoute, refreshConnectionRelays } from "./relay-host.js";

/**
 * Point the model runtime at loopback relays so raw account / BYOK secrets
 * never leave main. `~/.vetta/auth.json` receives the signed-in relay bearer.
 */
export async function bindModelRuntimeToConnectionRelays(): Promise<readonly RelayRoute[]> {
	const routes = await refreshConnectionRelays();
	const runtime = getOrCreateSharedModelRuntime();
	const signedIn = routes.find((route) => route.connectionId === SIGNED_IN_CONNECTION_ID);
	if (signedIn) {
		runtime.setServerUrl(relayBaseUrl(signedIn));
		runtime.setServerToken(signedIn.bearer);
		runtime.setServerTokenGetter(() => getConnectionRelayRoute(SIGNED_IN_CONNECTION_ID)?.bearer);
		syncCredentialFile(signedIn.bearer, signedIn.origin);
	} else {
		runtime.setServerToken(undefined);
		runtime.setServerTokenGetter(() => undefined);
		runtime.setServerUrl(DEFAULT_SERVER_URL);
		syncCredentialFile(undefined);
	}

	for (const route of routes) {
		if (route.connectionId === SIGNED_IN_CONNECTION_ID) continue;
		runtime.registerProvider(route.connectionId, {
			baseUrl: relayBaseUrl(route),
			apiKey: route.bearer,
		});
	}
	return routes;
}

export function relayBaseUrl(route: RelayRoute): string {
	const prefix = route.prefixes[0] ?? "";
	return `${route.origin}${prefix}`;
}
