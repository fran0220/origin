export interface CredentialRef {
	readonly namespace: string;
	readonly ownerId: string;
	readonly name: string;
}

export interface CredentialMetadata {
	readonly kind?: string;
	readonly consumer?: string;
	readonly expiresAt?: string;
}

export interface CredentialCryptography {
	readonly backend: string;
	readonly custody: "os-protected" | "owner-only-file";
	isAvailable(): boolean;
	encrypt(plainText: string): string;
	decrypt(cipherText: string): string;
}

export interface CredentialEntry {
	readonly ref: CredentialRef;
	readonly value: string;
	readonly metadata?: CredentialMetadata;
}

export interface CredentialVaultWarning {
	readonly code: "owner-only-file-fallback";
	readonly backend: string;
	readonly message: string;
}

export const ACCOUNT_ACCESS_TOKEN_REF: CredentialRef = {
	namespace: "account",
	ownerId: "vetta",
	name: "access-token",
};
export const ACCOUNT_REFRESH_TOKEN_REF: CredentialRef = {
	namespace: "account",
	ownerId: "vetta",
	name: "refresh-token",
};

export function modelApiKeyRef(credentialRef: string): CredentialRef {
	return { namespace: "models", ownerId: credentialRef, name: "api-key" };
}

export function connectionSecretRef(connectionId: string): CredentialRef {
	return { namespace: "connections", ownerId: connectionId, name: "secret" };
}

export function mcpSecretRef(serverName: string, field: "env" | "headers", key: string): CredentialRef {
	return { namespace: "mcp", ownerId: serverName, name: `${field}:${key}` };
}
