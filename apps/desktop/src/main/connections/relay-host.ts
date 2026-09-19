import {
	type ConnectionRelayHost,
	createConnectionRelayHost,
	type RelayRoute,
	type RelayUpstream,
} from "@origin/runtime-node/credentials";
import { getAppLogger } from "../logger.js";
import { getConnectionCatalog } from "./catalog.js";

const log = getAppLogger("connection-relay");

let host: ConnectionRelayHost | undefined;

export async function ensureConnectionRelayHost(): Promise<ConnectionRelayHost> {
	host ??= createConnectionRelayHost({
		log: (message) => log.warn(message),
	});
	await host.configure(collectUpstreams());
	return host;
}

export async function refreshConnectionRelays(): Promise<readonly RelayRoute[]> {
	const relay = await ensureConnectionRelayHost();
	await relay.configure(collectUpstreams());
	return relay.routes();
}

export function getConnectionRelayRoute(connectionId: string): RelayRoute | undefined {
	return host?.route(connectionId);
}

export async function closeConnectionRelayHost(): Promise<void> {
	const current = host;
	host = undefined;
	await current?.close();
}

function collectUpstreams(): RelayUpstream[] {
	const catalog = getConnectionCatalog();
	return catalog.list().flatMap((state) => {
		const secret = catalog.secret(state.descriptor.id);
		if (!secret) return [];
		return [
			{
				connectionId: state.descriptor.id,
				upstreamOrigin: state.descriptor.endpoint,
				prefixes: state.descriptor.relayPrefixes ?? ["/v1"],
				secret,
			},
		];
	});
}
