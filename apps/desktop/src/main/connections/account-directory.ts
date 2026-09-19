import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@vetta/coding-agent/config";
import {
	ACCOUNT_SELECTION_FILE,
	ACCOUNTS_PARTITION,
	type AccountScopeKind,
	type AccountSelection,
	accountScopeKey,
	defaultLoggedOutSelection,
	LOGGED_OUT_PARTITION,
	resolveAccountScopedDir,
} from "@vetta/coding-agent/connections";
import { atomicWriteJSON } from "@vetta/toolkit/atomic-write";

const LEGACY_KIND_NAMES: readonly AccountScopeKind[] = ["checkpoints", "evolution", "recordings", "sessions"];

export interface AccountDirectoryService {
	selection(): AccountSelection;
	agentDir(): string;
	resolve(kind: AccountScopeKind): string;
	admit(providerOrigin: string, subject: string, providerEndpoint: string): AccountSelection;
	selectLoggedOut(): AccountSelection;
}

let current: LiveAccountDirectory | undefined;

export function getAccountDirectoryService(agentDir = getAgentDir()): AccountDirectoryService {
	if (!current || current.agentDirPath !== agentDir) {
		current = new LiveAccountDirectory(agentDir);
		current.bootstrap();
	}
	return current;
}

export function resolveAccountScopedDirForHost(kind: AccountScopeKind, agentDir = getAgentDir()): string {
	return getAccountDirectoryService(agentDir).resolve(kind);
}

class LiveAccountDirectory implements AccountDirectoryService {
	private currentSelection: AccountSelection;

	constructor(readonly agentDirPath: string) {
		this.currentSelection = readSelection(agentDirPath) ?? defaultLoggedOutSelection();
	}

	bootstrap(): void {
		mkdirSync(join(this.agentDirPath, LOGGED_OUT_PARTITION), { recursive: true, mode: 0o700 });
		mkdirSync(join(this.agentDirPath, ACCOUNTS_PARTITION), { recursive: true, mode: 0o700 });
		migrateUnscopedLegacyTrees(this.agentDirPath, this.currentSelection);
		if (!existsSync(join(this.agentDirPath, ACCOUNT_SELECTION_FILE))) {
			writeSelection(this.agentDirPath, this.currentSelection);
		}
	}

	selection(): AccountSelection {
		return this.currentSelection;
	}

	agentDir(): string {
		return this.agentDirPath;
	}

	resolve(kind: AccountScopeKind): string {
		const directory = resolveAccountScopedDir(this.agentDirPath, kind, this.currentSelection);
		mkdirSync(directory, { recursive: true, mode: 0o700 });
		return directory;
	}

	admit(providerOrigin: string, subject: string, providerEndpoint: string): AccountSelection {
		const next: AccountSelection = {
			scope: accountScopeKey(providerOrigin, subject),
			providerEndpoint,
		};
		this.currentSelection = next;
		writeSelection(this.agentDirPath, next);
		mkdirSync(this.resolve("root"), { recursive: true, mode: 0o700 });
		return next;
	}

	selectLoggedOut(): AccountSelection {
		this.currentSelection = defaultLoggedOutSelection();
		writeSelection(this.agentDirPath, this.currentSelection);
		return this.currentSelection;
	}
}

function readSelection(agentDir: string): AccountSelection | undefined {
	const path = join(agentDir, ACCOUNT_SELECTION_FILE);
	if (!existsSync(path)) return undefined;
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as {
			scope?: string | null;
			providerEndpoint?: string | null;
		};
		return {
			scope: parsed.scope ?? null,
			providerEndpoint: parsed.providerEndpoint ?? null,
		};
	} catch {
		return undefined;
	}
}

function writeSelection(agentDir: string, selection: AccountSelection): void {
	atomicWriteJSON(join(agentDir, ACCOUNT_SELECTION_FILE), selection);
}

/**
 * Move leftover `<agentDir>/<kind>` trees into the current partition so a
 * first login or first launch never drops checkpoints / evolution / recordings.
 * Already-partitioned trees are left alone.
 */
export function migrateUnscopedLegacyTrees(agentDir: string, selection: AccountSelection): void {
	for (const kind of LEGACY_KIND_NAMES) {
		const legacy = join(agentDir, kind);
		if (!existsSync(legacy) || !statSync(legacy).isDirectory()) continue;
		const targetParent = resolveAccountScopedDir(agentDir, "root", selection);
		mkdirSync(targetParent, { recursive: true, mode: 0o700 });
		const target = join(targetParent, kind);
		if (!existsSync(target)) {
			renameSync(legacy, target);
			continue;
		}
		mergeDirectory(legacy, target);
	}
}

function mergeDirectory(source: string, target: string): void {
	mkdirSync(target, { recursive: true, mode: 0o700 });
	for (const entry of readdirSync(source, { withFileTypes: true })) {
		const from = join(source, entry.name);
		const to = join(target, entry.name);
		if (entry.isDirectory()) {
			if (!existsSync(to)) renameSync(from, to);
			else mergeDirectory(from, to);
			continue;
		}
		if (!existsSync(to)) renameSync(from, to);
		else renameSync(from, `${to}.legacy-${shortHash(from)}`);
	}
}

function shortHash(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
