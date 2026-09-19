import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CredentialCryptography } from "./types.js";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const KEY_FILE_NAME = "vault.key";

/**
 * Fallback cryptography used when OS-protected storage is unavailable
 * (Linux `basic_text`, CLI, headless). The wrapping key lives in a 0600
 * file; Windows additionally tightens the ACL to the current user.
 * Callers must surface a visible warning — this backend is never silent.
 */
export class OwnerOnlyFileCryptography implements CredentialCryptography {
	readonly backend = "owner-only-file";
	readonly custody = "owner-only-file" as const;
	private cachedKey: Buffer | undefined;

	constructor(private readonly keyDirectory: string) {}

	isAvailable(): boolean {
		return true;
	}

	encrypt(plainText: string): string {
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
		const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
		const tag = cipher.getAuthTag();
		return Buffer.concat([iv, tag, encrypted]).toString("base64");
	}

	decrypt(cipherText: string): string {
		const packed = Buffer.from(cipherText, "base64");
		if (packed.length < IV_BYTES + 16) throw new Error("Invalid owner-only ciphertext");
		const iv = packed.subarray(0, IV_BYTES);
		const tag = packed.subarray(IV_BYTES, IV_BYTES + 16);
		const encrypted = packed.subarray(IV_BYTES + 16);
		const decipher = createDecipheriv("aes-256-gcm", this.key(), iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
	}

	keyPath(): string {
		return join(this.keyDirectory, KEY_FILE_NAME);
	}

	private key(): Buffer {
		if (this.cachedKey) return this.cachedKey;
		mkdirSync(this.keyDirectory, { recursive: true, mode: 0o700 });
		tightenDirectoryPermissions(this.keyDirectory);
		const path = this.keyPath();
		if (!existsSync(path)) {
			const generated = randomBytes(KEY_BYTES);
			writeFileSync(path, generated, { mode: 0o600 });
			tightenFilePermissions(path);
			this.cachedKey = generated;
			return generated;
		}
		const loaded = readFileSync(path);
		if (loaded.length !== KEY_BYTES) throw new Error("Invalid owner-only vault key");
		this.cachedKey = loaded;
		return loaded;
	}
}

export function tightenFilePermissions(path: string): void {
	try {
		chmodSync(path, 0o600);
	} catch {
		// Non-POSIX filesystems ignore mode; Windows uses ACL below.
	}
	applyWindowsOwnerAcl(path);
}

export function tightenDirectoryPermissions(path: string): void {
	try {
		chmodSync(path, 0o700);
	} catch {
		// Best effort.
	}
	applyWindowsOwnerAcl(path);
}

function applyWindowsOwnerAcl(path: string): void {
	if (process.platform !== "win32") return;
	try {
		const user = process.env.USERNAME;
		if (!user) return;
		execFileSync("icacls", [path, "/inheritance:r", "/grant:r", `${user}:F`], {
			stdio: "ignore",
			windowsHide: true,
		});
	} catch {
		// ACL tightening is best-effort; the 0600 attempt still ran.
	}
}

export function ownerOnlyKeyDirectory(rootDirectory: string): string {
	return join(dirname(rootDirectory), "vault-key");
}
