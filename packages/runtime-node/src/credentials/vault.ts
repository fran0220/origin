import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tightenDirectoryPermissions, tightenFilePermissions } from "./owner-only-cryptography.js";
import type {
	CredentialCryptography,
	CredentialEntry,
	CredentialMetadata,
	CredentialRef,
	CredentialVaultWarning,
} from "./types.js";

interface CredentialRecord {
	schemaVersion: 1;
	ref: CredentialRef;
	backend: string;
	ciphertext: string;
	createdAt: string;
	updatedAt: string;
	metadata?: CredentialMetadata;
}

const RECORD_SUFFIX = ".credential.json";
const REF_PART_MAX_LENGTH = 256;

export class CredentialVault {
	constructor(
		private readonly rootDirectory: string,
		private readonly cryptography: CredentialCryptography,
		private readonly warning?: CredentialVaultWarning,
	) {}

	isAvailable(): boolean {
		return this.cryptography.isAvailable();
	}

	custody(): CredentialCryptography["custody"] {
		return this.cryptography.custody;
	}

	backend(): string {
		return this.cryptography.backend;
	}

	visibleWarning(): CredentialVaultWarning | undefined {
		return this.warning;
	}

	has(ref: CredentialRef): boolean {
		return existsSync(this.recordPath(ref));
	}

	get(ref: CredentialRef): string | undefined {
		const record = this.readRecord(ref);
		if (!record) return undefined;
		this.assertAvailable();
		return this.cryptography.decrypt(record.ciphertext);
	}

	put(ref: CredentialRef, value: string, metadata?: CredentialMetadata): void {
		this.assertAvailable();
		const normalizedRef = normalizeCredentialRef(ref);
		const existing = this.readRecord(normalizedRef);
		const now = new Date().toISOString();
		const record: CredentialRecord = {
			schemaVersion: 1,
			ref: normalizedRef,
			backend: this.cryptography.backend,
			ciphertext: this.cryptography.encrypt(value),
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
			...(metadata === undefined ? {} : { metadata: { ...metadata } }),
		};
		this.ensureDirectory();
		const path = this.recordPath(normalizedRef);
		atomicWriteJSON(path, record);
		tightenFilePermissions(path);
	}

	remove(ref: CredentialRef): void {
		rmSync(this.recordPath(ref), { force: true });
	}

	listRefs(namespace?: string): CredentialRef[] {
		if (!existsSync(this.rootDirectory)) return [];
		const refs: CredentialRef[] = [];
		for (const fileName of readdirSync(this.rootDirectory).sort()) {
			if (!fileName.endsWith(RECORD_SUFFIX)) continue;
			const record = parseCredentialRecord(readFileSync(join(this.rootDirectory, fileName), "utf8"));
			if (namespace !== undefined && record.ref.namespace !== namespace) continue;
			refs.push({ ...record.ref });
		}
		return refs;
	}

	list(namespace?: string): CredentialEntry[] {
		return this.listRefs(namespace).map((ref) => {
			const value = this.get(ref);
			if (value === undefined) throw new Error("Credential record vanished during list");
			const record = this.readRecord(ref);
			return {
				ref,
				value,
				...(record?.metadata === undefined ? {} : { metadata: { ...record.metadata } }),
			};
		});
	}

	knownSecretValues(): string[] {
		const values: string[] = [];
		for (const entry of this.list()) {
			if (entry.value.length >= 8) values.push(entry.value);
		}
		return values;
	}

	private readRecord(ref: CredentialRef): CredentialRecord | undefined {
		const normalizedRef = normalizeCredentialRef(ref);
		const path = this.recordPath(normalizedRef);
		if (!existsSync(path)) return undefined;
		const record = parseCredentialRecord(readFileSync(path, "utf8"));
		if (!sameCredentialRef(record.ref, normalizedRef)) {
			throw new Error("Credential record identity mismatch");
		}
		return record;
	}

	private recordPath(ref: CredentialRef): string {
		const normalizedRef = normalizeCredentialRef(ref);
		const id = credentialRefId(normalizedRef);
		const hash = createHash("sha256").update(id).digest("hex");
		return join(this.rootDirectory, `${hash}${RECORD_SUFFIX}`);
	}

	private ensureDirectory(): void {
		mkdirSync(this.rootDirectory, { recursive: true, mode: 0o700 });
		tightenDirectoryPermissions(this.rootDirectory);
	}

	private assertAvailable(): void {
		if (!this.cryptography.isAvailable()) {
			throw new Error("Secure credential storage is unavailable");
		}
	}
}

function normalizeCredentialRef(ref: CredentialRef): CredentialRef {
	return {
		namespace: normalizeRefPart(ref.namespace, "namespace"),
		ownerId: normalizeRefPart(ref.ownerId, "ownerId"),
		name: normalizeRefPart(ref.name, "name"),
	};
}

function normalizeRefPart(value: string, fieldName: string): string {
	const normalized = value.trim();
	if (!normalized || normalized.length > REF_PART_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) {
		throw new Error(`Invalid credential ${fieldName}`);
	}
	return normalized;
}

function credentialRefId(ref: CredentialRef): string {
	return JSON.stringify([ref.namespace, ref.ownerId, ref.name]);
}

function sameCredentialRef(left: CredentialRef, right: CredentialRef): boolean {
	return left.namespace === right.namespace && left.ownerId === right.ownerId && left.name === right.name;
}

function parseCredentialRecord(raw: string): CredentialRecord {
	const parsed = JSON.parse(raw) as Partial<CredentialRecord>;
	if (
		parsed.schemaVersion !== 1 ||
		!parsed.ref ||
		typeof parsed.backend !== "string" ||
		typeof parsed.ciphertext !== "string" ||
		typeof parsed.createdAt !== "string" ||
		typeof parsed.updatedAt !== "string"
	) {
		throw new Error("Invalid credential record");
	}
	return {
		schemaVersion: 1,
		ref: normalizeCredentialRef(parsed.ref),
		backend: parsed.backend,
		ciphertext: parsed.ciphertext,
		createdAt: parsed.createdAt,
		updatedAt: parsed.updatedAt,
		...(parsed.metadata === undefined ? {} : { metadata: { ...parsed.metadata } }),
	};
}

function atomicWriteJSON(path: string, value: unknown): void {
	const dir = dirname(path);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	const tmpPath = `${path}.${process.pid}.tmp`;
	const fd = openSync(tmpPath, "w");
	try {
		writeSync(fd, JSON.stringify(value, null, 2));
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	renameSync(tmpPath, path);
}
