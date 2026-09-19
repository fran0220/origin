import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import {
	ACCOUNT_ACCESS_TOKEN_REF,
	ACCOUNT_REFRESH_TOKEN_REF,
	type CredentialRef,
	mcpSecretRef,
	modelApiKeyRef,
} from "./types.js";
import type { CredentialVault } from "./vault.js";

export const VAULT_REF_PREFIX = "vault://";

export interface LegacySecretMigrationResult {
	readonly migrated: number;
	readonly skipped: number;
	readonly files: readonly string[];
}

const MCP_SECRET_KEY_FRAGMENTS = [
	"token",
	"key",
	"secret",
	"password",
	"authorization",
	"apikey",
	"api-key",
	"x-api-key",
] as const;

export function isSecretFieldName(name: string): boolean {
	const lower = name.toLowerCase();
	return MCP_SECRET_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment));
}

export function encodeVaultRef(ref: CredentialRef): string {
	return `${VAULT_REF_PREFIX}${encodeURIComponent(ref.namespace)}/${encodeURIComponent(ref.ownerId)}/${encodeURIComponent(ref.name)}`;
}

export function decodeVaultRef(value: string): CredentialRef | undefined {
	if (!value.startsWith(VAULT_REF_PREFIX)) return undefined;
	const parts = value.slice(VAULT_REF_PREFIX.length).split("/");
	if (parts.length !== 3) return undefined;
	const [namespace, ownerId, name] = parts.map((part) => decodeURIComponent(part));
	if (!namespace || !ownerId || !name) return undefined;
	return { namespace, ownerId, name };
}

export function migrateLegacySecrets(options: {
	readonly vault: CredentialVault;
	readonly settingsPath: string;
	readonly modelsPath: string;
	readonly mcpPath: string;
	readonly authJsonPath: string;
}): LegacySecretMigrationResult {
	if (!options.vault.isAvailable()) {
		return { migrated: 0, skipped: 0, files: [] };
	}
	let migrated = 0;
	const files: string[] = [];

	migrated += migrateSettingsTokens(options.vault, options.settingsPath, files);
	migrated += migrateModelApiKeys(options.vault, options.modelsPath, files);
	migrated += migrateMcpSecrets(options.vault, options.mcpPath, files);
	migrated += migrateAuthJson(options.vault, options.authJsonPath, files);

	return { migrated, skipped: 0, files };
}

function migrateSettingsTokens(vault: CredentialVault, path: string, files: string[]): number {
	const document = readJsonRecord(path);
	if (!document) return 0;
	let count = 0;
	count += takeStringSecret(vault, document, "serverToken", ACCOUNT_ACCESS_TOKEN_REF);
	count += takeStringSecret(vault, document, "serverRefreshToken", ACCOUNT_REFRESH_TOKEN_REF);
	if (count > 0) {
		writeJson(path, document);
		files.push(path);
	}
	return count;
}

function migrateModelApiKeys(vault: CredentialVault, path: string, files: string[]): number {
	const document = readJsonRecord(path);
	if (!document) return 0;
	const providers = asRecord(document.providers);
	if (!providers) return 0;
	let count = 0;
	for (const [providerId, raw] of Object.entries(providers)) {
		const provider = asRecord(raw);
		if (!provider) continue;
		const apiKey = typeof provider.apiKey === "string" ? provider.apiKey : undefined;
		if (!apiKey || apiKey === "***" || decodeVaultRef(apiKey)) continue;
		if (typeof provider.credentialRef === "string" && provider.credentialRef.length > 0) {
			if (!vault.has(modelApiKeyRef(provider.credentialRef))) {
				vault.put(modelApiKeyRef(provider.credentialRef), apiKey, { kind: "api-key", consumer: "model-provider" });
				count += 1;
			}
			delete provider.apiKey;
			continue;
		}
		const credentialRef = `migrated:${providerId}`;
		vault.put(modelApiKeyRef(credentialRef), apiKey, { kind: "api-key", consumer: "model-provider" });
		provider.credentialRef = credentialRef;
		delete provider.apiKey;
		count += 1;
	}
	if (count > 0) {
		writeJson(path, document);
		files.push(path);
	}
	return count;
}

function migrateMcpSecrets(vault: CredentialVault, path: string, files: string[]): number {
	const document = readJsonRecord(path);
	if (!document) return 0;
	const count = storeMcpConfigSecrets(vault, document);
	if (count > 0) {
		writeJson(path, document);
		files.push(path);
	}
	return count;
}

/** Replace plaintext env/header secrets in a validated document before the caller persists it. */
export function storeMcpConfigSecrets(vault: CredentialVault, document: { readonly mcpServers?: unknown }): number {
	const servers = asRecord(document.mcpServers);
	if (!servers) return 0;
	let count = 0;
	for (const [serverName, raw] of Object.entries(servers)) {
		const server = asRecord(raw);
		if (!server) continue;
		count += migrateSecretRecord(vault, server, "env", serverName, "env");
		count += migrateSecretRecord(vault, server, "headers", serverName, "headers");
	}
	return count;
}

function migrateSecretRecord(
	vault: CredentialVault,
	owner: Record<string, unknown>,
	field: "env" | "headers",
	serverName: string,
	kind: "env" | "headers",
): number {
	const record = asRecord(owner[field]);
	if (!record) return 0;
	let count = 0;
	for (const [key, value] of Object.entries(record)) {
		if (typeof value !== "string" || value.length === 0) continue;
		if (!isSecretFieldName(key)) continue;
		if (decodeVaultRef(value) || value === "***") continue;
		const ref = mcpSecretRef(serverName, kind, key);
		vault.put(ref, value, { kind: `mcp-${kind}`, consumer: serverName });
		record[key] = encodeVaultRef(ref);
		count += 1;
	}
	return count;
}

function migrateAuthJson(vault: CredentialVault, path: string, files: string[]): number {
	const document = readJsonRecord(path);
	if (!document) return 0;
	const token = typeof document.token === "string" ? document.token : undefined;
	if (!token || decodeVaultRef(token)) return 0;
	if (!vault.has(ACCOUNT_ACCESS_TOKEN_REF)) {
		vault.put(ACCOUNT_ACCESS_TOKEN_REF, token, { kind: "access-token", consumer: "account" });
	}
	delete document.token;
	writeJson(path, document);
	files.push(path);
	return 1;
}

function takeStringSecret(
	vault: CredentialVault,
	document: Record<string, unknown>,
	field: string,
	ref: CredentialRef,
): number {
	const value = document[field];
	if (typeof value !== "string" || value.length === 0) return 0;
	if (!vault.has(ref)) vault.put(ref, value, { kind: field, consumer: "account" });
	delete document[field];
	return 1;
}

function readJsonRecord(path: string): Record<string, unknown> | undefined {
	if (!existsSync(path)) return undefined;
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
		return asRecord(parsed);
	} catch {
		return undefined;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function writeJson(path: string, value: unknown): void {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const tmpPath = `${path}.${process.pid}.tmp`;
	const fd = openSync(tmpPath, "w");
	try {
		writeSync(fd, `${JSON.stringify(value, null, 2)}\n`);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	renameSync(tmpPath, path);
}
