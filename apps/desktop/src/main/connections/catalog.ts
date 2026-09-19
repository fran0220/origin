import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type ConnectionDescriptor,
	type ConnectionReadState,
	type CredentialOrigin,
	parseConnectionEndpoint,
	SIGNED_IN_CONNECTION_ID,
	stripEndpointToOrigin,
} from "@origin/coding-agent/connections";
import { type CredentialVault, connectionSecretRef } from "@origin/runtime-node/credentials";
import { atomicWriteJSON } from "@origin/toolkit/atomic-write";
import {
	getDesktopCredentialVault,
	getDesktopCredentialVaultWarning,
} from "../credentials/desktop-credential-vault.js";
import { resolveAccountScopedDirForHost } from "./account-directory.js";

const FILE_NAME = "connections.json";
const FORMAT_EPOCH = 1;

interface StoredCatalog {
	formatEpoch: number;
	connections: ConnectionDescriptor[];
}

export interface ConnectionDraft {
	readonly id?: string;
	readonly displayName: string;
	readonly protocol: string;
	readonly endpoint: string;
	readonly secret?: string;
	readonly credentialOrigin?: CredentialOrigin;
	readonly relayPrefixes?: readonly string[];
	readonly anchorModel?: string;
}

export class ConnectionCatalog {
	constructor(private readonly vault: CredentialVault = getDesktopCredentialVault()) {}

	list(): ConnectionReadState[] {
		return this.descriptors().map((descriptor) => this.project(descriptor));
	}

	get(id: string): ConnectionReadState | undefined {
		const descriptor = this.descriptors().find((item) => item.id === id);
		return descriptor ? this.project(descriptor) : undefined;
	}

	secret(id: string): string | undefined {
		return this.vault.get(connectionSecretRef(id));
	}

	upsertProvided(draft: ConnectionDraft): ConnectionReadState {
		const id = draft.id?.trim() || slugConnectionId(draft.displayName);
		const { origin, pathPrefix } = stripEndpointToOrigin(draft.endpoint);
		const relayPrefixes =
			draft.relayPrefixes && draft.relayPrefixes.length > 0
				? [...draft.relayPrefixes]
				: pathPrefix
					? [pathPrefix]
					: undefined;
		const descriptor: ConnectionDescriptor = {
			id,
			displayName: draft.displayName.trim() || id,
			protocol: draft.protocol,
			endpoint: parseConnectionEndpoint(origin),
			credentialOrigin: draft.credentialOrigin ?? "provided",
			...(relayPrefixes ? { relayPrefixes } : {}),
			...(draft.anchorModel ? { anchorModel: draft.anchorModel } : {}),
		};
		if (draft.secret && draft.secret !== "***") {
			this.vault.put(connectionSecretRef(id), draft.secret, { kind: "connection-secret", consumer: id });
		}
		this.write(
			this.descriptors()
				.filter((item) => item.id !== id)
				.concat(descriptor),
		);
		return this.project(descriptor);
	}

	upsertSignedIn(input: {
		readonly displayName: string;
		readonly endpoint: string;
		readonly secret: string;
		readonly account: ConnectionDescriptor["account"];
		readonly protocol?: string;
	}): ConnectionReadState {
		const { origin, pathPrefix } = stripEndpointToOrigin(input.endpoint);
		const descriptor: ConnectionDescriptor = {
			id: SIGNED_IN_CONNECTION_ID,
			displayName: input.displayName,
			protocol: input.protocol ?? "openai",
			endpoint: parseConnectionEndpoint(origin),
			credentialOrigin: "signed-in",
			...(pathPrefix ? { relayPrefixes: [pathPrefix] } : {}),
			...(input.account ? { account: input.account } : {}),
		};
		this.vault.put(connectionSecretRef(SIGNED_IN_CONNECTION_ID), input.secret, {
			kind: "connection-secret",
			consumer: SIGNED_IN_CONNECTION_ID,
		});
		this.write(
			this.descriptors()
				.filter((item) => item.id !== SIGNED_IN_CONNECTION_ID)
				.concat(descriptor),
		);
		return this.project(descriptor);
	}

	remove(id: string): void {
		this.vault.remove(connectionSecretRef(id));
		this.write(this.descriptors().filter((item) => item.id !== id));
	}

	hasSecret(id: string): boolean {
		return this.vault.has(connectionSecretRef(id));
	}

	private project(descriptor: ConnectionDescriptor): ConnectionReadState {
		const warning = getDesktopCredentialVaultWarning();
		return {
			descriptor,
			status: this.vault.has(connectionSecretRef(descriptor.id)) ? "ready" : "configured",
			credentialState: this.vault.has(connectionSecretRef(descriptor.id)) ? "available" : "missing",
			credentialCustody: warning ? "owner-only-file" : this.vault.custody(),
			credentialEpoch: this.vault.has(connectionSecretRef(descriptor.id)) ? 1 : 0,
			updatedAt: new Date().toISOString(),
			quota: {
				status: this.vault.has(connectionSecretRef(descriptor.id)) ? "ok" : "unknown",
				readAt: new Date().toISOString(),
			},
		};
	}

	private descriptors(): ConnectionDescriptor[] {
		const path = catalogPath();
		if (!existsSync(path)) return [];
		try {
			const stored = JSON.parse(readFileSync(path, "utf8")) as StoredCatalog;
			if (!Array.isArray(stored.connections)) return [];
			return stored.connections.map(normalizeDescriptor);
		} catch {
			return [];
		}
	}

	private write(connections: ConnectionDescriptor[]): void {
		const directory = resolveAccountScopedDirForHost("connections");
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		atomicWriteJSON(join(directory, FILE_NAME), {
			formatEpoch: FORMAT_EPOCH,
			connections,
		} satisfies StoredCatalog);
	}
}

function catalogPath(): string {
	return join(resolveAccountScopedDirForHost("connections"), FILE_NAME);
}

function normalizeDescriptor(raw: ConnectionDescriptor): ConnectionDescriptor {
	return {
		...raw,
		endpoint: parseConnectionEndpoint(String(raw.endpoint)),
		credentialOrigin: raw.credentialOrigin ?? "provided",
	};
}

function slugConnectionId(displayName: string): string {
	const slug = displayName
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || `connection-${Date.now().toString(36)}`;
}

let catalog: ConnectionCatalog | undefined;

export function getConnectionCatalog(): ConnectionCatalog {
	catalog ??= new ConnectionCatalog();
	return catalog;
}
