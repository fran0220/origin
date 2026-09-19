import type { ConnectionEndpoint } from "./endpoint.js";

/**
 * How a Connection's credential arrived on this device.
 *
 * `signed-in` — a browser sign-in minted it for this device; leaving means Sign out.
 * `provided` — the account holder pasted it; leaving means Remove (the key lives on).
 * `env` — process environment; read-only here, delete the variable to remove.
 * `command` — produced by an operator-configured command; not typed into the UI.
 */
export const CREDENTIAL_ORIGINS = ["signed-in", "provided", "env", "command"] as const;
export type CredentialOrigin = (typeof CREDENTIAL_ORIGINS)[number];

export const PROVIDER_PROTOCOLS = ["openai", "anthropic", "google", "openai-responses"] as const;
export type ProviderProtocol = (typeof PROVIDER_PROTOCOLS)[number] | (string & {});

/**
 * Provider account identity. Quota and anything that expires must not live here.
 * The type is structurally unable to carry a credential.
 */
export interface ConnectionAccount {
	readonly subject: string;
	readonly username: string;
	readonly displayName: string;
	readonly email?: string;
}

/**
 * Persistable Connection configuration. Provider credentials, relay bearers,
 * headers, and arbitrary secret metadata are intentionally not representable.
 */
export interface ConnectionDescriptor {
	readonly id: string;
	readonly displayName: string;
	readonly protocol: ProviderProtocol;
	readonly endpoint: ConnectionEndpoint;
	readonly account?: ConnectionAccount;
	readonly credentialOrigin: CredentialOrigin;
	readonly relayPrefixes?: readonly string[];
	readonly anchorModel?: string;
}

export const CONNECTION_STATUSES = ["configured", "connecting", "ready", "degraded", "failed"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const CREDENTIAL_STATES = ["missing", "available", "rejected"] as const;
export type CredentialState = (typeof CREDENTIAL_STATES)[number];

export const CREDENTIAL_CUSTODY = ["os-protected", "owner-only-file"] as const;
export type CredentialCustody = (typeof CREDENTIAL_CUSTODY)[number];

export interface LiveQuota {
	readonly status: "ok" | "unknown";
	readonly readAt: string;
	readonly windows?: readonly QuotaWindow[];
}

export interface QuotaWindow {
	readonly kind: string;
	readonly limit: number;
	readonly consumed: number;
	readonly resetAt?: string;
}

/**
 * Secret-free projection shown to renderer, CLI, logs, and diagnostics.
 */
export interface ConnectionReadState {
	readonly descriptor: ConnectionDescriptor;
	readonly status: ConnectionStatus;
	readonly credentialState: CredentialState;
	readonly credentialCustody: CredentialCustody;
	readonly credentialEpoch: number;
	readonly updatedAt: string;
	readonly quota?: LiveQuota;
}

export const SIGNED_IN_CONNECTION_ID = "vetta";
export const DEFAULT_RELAY_PREFIXES = ["/v1"] as const;

export function isCredentialOrigin(value: unknown): value is CredentialOrigin {
	return typeof value === "string" && (CREDENTIAL_ORIGINS as readonly string[]).includes(value);
}

export function leavingActionFor(origin: CredentialOrigin): "sign-out" | "remove" | "none" {
	switch (origin) {
		case "signed-in":
			return "sign-out";
		case "provided":
			return "remove";
		case "env":
		case "command":
			return "none";
	}
}
