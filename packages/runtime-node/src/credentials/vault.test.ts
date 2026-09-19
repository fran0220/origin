import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerOnlyFileCryptography } from "./owner-only-cryptography.js";
import type { CredentialCryptography } from "./types.js";
import { CredentialVault } from "./vault.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("CredentialVault", () => {
	it("persists encrypted records without plaintext", () => {
		const directory = createTemporaryDirectory();
		const vault = new CredentialVault(directory, new TestCryptography());
		const ref = { namespace: "models", ownerId: "openai", name: "api-key" };

		vault.put(ref, "sk-secret-value");

		expect(vault.get(ref)).toBe("sk-secret-value");
		const recordPath = join(directory, requireSingleRecord(directory));
		expect(readFileSync(recordPath, "utf8")).not.toContain("sk-secret-value");
	});

	it("encrypts and decrypts with the owner-only file backend", () => {
		const directory = createTemporaryDirectory();
		const cryptography = new OwnerOnlyFileCryptography(join(directory, "key"));
		const vault = new CredentialVault(join(directory, "records"), cryptography, {
			code: "owner-only-file-fallback",
			backend: cryptography.backend,
			message: "OS-protected storage is unavailable; secrets are in an owner-only file.",
		});

		vault.put({ namespace: "account", ownerId: "origin", name: "access-token" }, "access-secret");
		expect(vault.get({ namespace: "account", ownerId: "origin", name: "access-token" })).toBe("access-secret");
		expect(vault.visibleWarning()?.code).toBe("owner-only-file-fallback");
		expect(vault.custody()).toBe("owner-only-file");
		expect(statSync(join(directory, "key", "vault.key")).mode & 0o777).toBe(0o600);
	});

	it("refuses writes when secure storage is unavailable", () => {
		const directory = createTemporaryDirectory();
		const vault = new CredentialVault(directory, new TestCryptography(false));
		expect(() => vault.put({ namespace: "models", ownerId: "openai", name: "api-key" }, "secret")).toThrow(
			"Secure credential storage is unavailable",
		);
	});
});

class TestCryptography implements CredentialCryptography {
	readonly backend = "test";
	readonly custody = "os-protected" as const;

	constructor(private readonly available = true) {}

	isAvailable(): boolean {
		return this.available;
	}

	encrypt(plainText: string): string {
		return Buffer.from(plainText, "utf8").toString("base64");
	}

	decrypt(cipherText: string): string {
		return Buffer.from(cipherText, "base64").toString("utf8");
	}
}

function createTemporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "origin-runtime-vault-"));
	temporaryDirectories.push(directory);
	return directory;
}

function requireSingleRecord(directory: string): string {
	const files = readdirSync(directory).filter((name) => name.endsWith(".credential.json"));
	expect(files).toHaveLength(1);
	const file = files[0];
	if (!file) throw new Error("Credential record was not created");
	return file;
}
