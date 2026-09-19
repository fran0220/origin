import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const LEGACY_TRUNCATION = 128;
const LONG_KEY_PREFIX = "long.";

export class CheckpointProjectKeyCollisionError extends Error {
	readonly projectKey: string;
	readonly directory: string;

	constructor(projectKey: string, directory: string) {
		super("Checkpoint project key collides with another project's truncated directory");
		this.name = "CheckpointProjectKeyCollisionError";
		this.projectKey = projectKey;
		this.directory = directory;
	}
}

/** Directory that already is the account-scoped `checkpoints` root. */
export function checkpointProjectDir(checkpointRoot: string, projectKey: string): string {
	return join(checkpointRoot, resolveCheckpointProjectDirName(checkpointRoot, projectKey));
}

export function checkpointMainlinePath(checkpointRoot: string, projectKey: string): string {
	return join(checkpointProjectDir(checkpointRoot, projectKey), "mainline.jsonl");
}

export function checkpointReceiptsPath(checkpointRoot: string, projectKey: string): string {
	return join(checkpointProjectDir(checkpointRoot, projectKey), "receipts.jsonl");
}

export function checkpointPolicyPath(checkpointRoot: string, projectKey: string): string {
	return join(checkpointProjectDir(checkpointRoot, projectKey), "policy.json");
}

export function checkpointShadowGitDir(checkpointRoot: string, projectKey: string): string {
	return join(checkpointProjectDir(checkpointRoot, projectKey), "shadow.git");
}

/**
 * Filesystem-safe segment for a checkpoint projectKey.
 * Unsafe characters become `_`. Empty keys map to `home`.
 * Does not truncate: historical 128-character clipping collided for distinct
 * base64url cwd encodings that shared a prefix.
 */
export function sanitizeProjectKey(projectKey: string): string {
	const trimmed = projectKey.trim();
	if (!trimmed) return "home";
	return trimmed.replace(/[^A-Za-z0-9._-]+/g, "_");
}

export function truncatedLegacyProjectKey(projectKey: string): string {
	return sanitizeProjectKey(projectKey).slice(0, LEGACY_TRUNCATION);
}

export function longCheckpointProjectDirName(projectKey: string): string {
	return `${LONG_KEY_PREFIX}${createHash("sha256").update(projectKey).digest("hex")}`;
}

/**
 * Choose the on-disk directory for a projectKey.
 * Short keys keep their sanitized name. Long keys write to `long.<sha256>`.
 * A leftover 128-character truncated directory is reused only when every
 * readable mainline/policy projectKey and receipt cwd exclusively belong to
 * this key. Corrupt lines and empty leftovers are unproven and are not reused.
 * Mixed owners throw rather than migrate either project into the leftover.
 */
export function resolveCheckpointProjectDirName(checkpointRoot: string, projectKey: string): string {
	const safe = sanitizeProjectKey(projectKey);
	if (safe.length <= LEGACY_TRUNCATION) return safe;

	const hashed = longCheckpointProjectDirName(projectKey);
	if (existsSync(join(checkpointRoot, hashed))) return hashed;

	const legacy = safe.slice(0, LEGACY_TRUNCATION);
	const legacyDir = join(checkpointRoot, legacy);
	if (!existsSync(legacyDir)) return hashed;

	const ownership = inspectLegacyOwnership(legacyDir);
	if (ownership.kind === "unproven") return hashed;
	if (ownership.keys.length === 1 && ownership.keys[0] === projectKey) return legacy;
	if (ownership.keys.includes(projectKey)) {
		throw new CheckpointProjectKeyCollisionError(projectKey, legacyDir);
	}
	return hashed;
}

type LegacyOwnership = { readonly kind: "proven"; readonly keys: readonly string[] } | { readonly kind: "unproven" };

function inspectLegacyOwnership(directory: string): LegacyOwnership {
	const keys = new Set<string>();
	if (!collectJsonlOwners(join(directory, "mainline.jsonl"), keys, ownersFromRecord)) return { kind: "unproven" };
	if (!collectJsonlOwners(join(directory, "receipts.jsonl"), keys, ownersFromReceipt)) return { kind: "unproven" };
	if (!collectPolicyOwner(join(directory, "policy.json"), keys)) return { kind: "unproven" };
	if (keys.size === 0) return { kind: "unproven" };
	return { kind: "proven", keys: [...keys] };
}

function collectJsonlOwners(
	path: string,
	keys: Set<string>,
	ownersOf: (value: unknown) => readonly string[] | undefined,
): boolean {
	if (!existsSync(path)) return true;
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return false;
	}
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const owners = ownersOf(JSON.parse(trimmed) as unknown);
			if (!owners || owners.length === 0) return false;
			for (const owner of owners) keys.add(owner);
		} catch {
			return false;
		}
	}
	return true;
}

function collectPolicyOwner(path: string, keys: Set<string>): boolean {
	if (!existsSync(path)) return true;
	try {
		const owners = ownersFromRecord(JSON.parse(readFileSync(path, "utf8")) as unknown);
		if (!owners || owners.length === 0) return false;
		for (const owner of owners) keys.add(owner);
		return true;
	} catch {
		return false;
	}
}

function ownersFromRecord(value: unknown): readonly string[] | undefined {
	const projectKey = stringField(value, "projectKey");
	return projectKey ? [projectKey] : undefined;
}

function ownersFromReceipt(value: unknown): readonly string[] | undefined {
	const owners: string[] = [];
	const projectKey = stringField(value, "projectKey");
	if (projectKey) owners.push(projectKey);
	const cwd = stringField(value, "cwd");
	if (cwd) owners.push(Buffer.from(cwd, "utf8").toString("base64url"));
	return owners.length > 0 ? owners : undefined;
}

function stringField(value: unknown, field: string): string | undefined {
	if (!value || typeof value !== "object") return undefined;
	const candidate = (value as Record<string, unknown>)[field];
	return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}
