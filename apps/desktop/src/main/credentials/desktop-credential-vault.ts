import { join } from "node:path";
import { getOriginHomePath } from "@origin/action-rpc";
import {
	CredentialVault,
	type CredentialVaultWarning,
	OwnerOnlyFileCryptography,
	ownerOnlyKeyDirectory,
} from "@origin/runtime-node/credentials";
import { ElectronSafeStorageCryptography } from "./electron-safe-storage-cryptography.js";

let desktopCredentialVault: CredentialVault | undefined;
let desktopVaultWarning: CredentialVaultWarning | undefined;

export function getDesktopCredentialVault(): CredentialVault {
	if (desktopCredentialVault) return desktopCredentialVault;
	const rootDirectory = join(getOriginHomePath(), "desktop-app", "credentials");
	const osProtected = new ElectronSafeStorageCryptography();
	if (osProtected.isAvailable()) {
		desktopCredentialVault = new CredentialVault(rootDirectory, osProtected);
		return desktopCredentialVault;
	}
	const fallback = new OwnerOnlyFileCryptography(ownerOnlyKeyDirectory(rootDirectory));
	desktopVaultWarning = {
		code: "owner-only-file-fallback",
		backend: fallback.backend,
		message:
			"OS-protected credential storage is unavailable; secrets are kept in an owner-only file (mode 0600). This is not silent encryption.",
	};
	desktopCredentialVault = new CredentialVault(rootDirectory, fallback, desktopVaultWarning);
	return desktopCredentialVault;
}

export function getDesktopCredentialVaultWarning(): CredentialVaultWarning | undefined {
	getDesktopCredentialVault();
	return desktopVaultWarning;
}

/** Test hook. Production code never replaces the process vault this way. */
export function setDesktopCredentialVaultForTests(vault: CredentialVault | undefined): void {
	desktopCredentialVault = vault;
	desktopVaultWarning = vault?.visibleWarning();
}
