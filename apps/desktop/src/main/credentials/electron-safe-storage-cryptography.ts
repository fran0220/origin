import type { CredentialCryptography } from "@origin/runtime-node/credentials";
import { safeStorage } from "electron";

export class ElectronSafeStorageCryptography implements CredentialCryptography {
	readonly backend = "electron-safe-storage";
	readonly custody = "os-protected" as const;

	isAvailable(): boolean {
		if (!safeStorage.isEncryptionAvailable()) return false;
		return process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text";
	}

	encrypt(plainText: string): string {
		return safeStorage.encryptString(plainText).toString("base64");
	}

	decrypt(cipherText: string): string {
		return safeStorage.decryptString(Buffer.from(cipherText, "base64"));
	}
}
