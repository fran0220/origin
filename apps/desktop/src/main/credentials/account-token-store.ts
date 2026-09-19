import { ACCOUNT_ACCESS_TOKEN_REF, ACCOUNT_REFRESH_TOKEN_REF } from "@vetta/runtime-node/credentials";
import { getDesktopCredentialVault } from "./desktop-credential-vault.js";

export function readAccountAccessToken(): string | undefined {
	return getDesktopCredentialVault().get(ACCOUNT_ACCESS_TOKEN_REF);
}

export function readAccountRefreshToken(): string | undefined {
	return getDesktopCredentialVault().get(ACCOUNT_REFRESH_TOKEN_REF);
}

export function writeAccountTokens(access: string, refresh?: string): void {
	const vault = getDesktopCredentialVault();
	vault.put(ACCOUNT_ACCESS_TOKEN_REF, access, { kind: "access-token", consumer: "account" });
	if (refresh) {
		vault.put(ACCOUNT_REFRESH_TOKEN_REF, refresh, { kind: "refresh-token", consumer: "account" });
	}
}

export function clearAccountTokens(): void {
	const vault = getDesktopCredentialVault();
	vault.remove(ACCOUNT_ACCESS_TOKEN_REF);
	vault.remove(ACCOUNT_REFRESH_TOKEN_REF);
}

export function hasAccountSession(): boolean {
	return Boolean(readAccountAccessToken());
}
