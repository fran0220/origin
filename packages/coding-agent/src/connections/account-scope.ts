import { createHash } from "node:crypto";

export const ACCOUNT_SCOPE_KIND = [
	"root",
	"checkpoints",
	"evolution",
	"recordings",
	"evaluation",
	"connections",
	"sessions",
	"settings",
] as const;
export type AccountScopeKind = (typeof ACCOUNT_SCOPE_KIND)[number];

export const LOGGED_OUT_PARTITION = "logged-out";
export const ACCOUNTS_PARTITION = "accounts";
export const ACCOUNT_SELECTION_FILE = "account-selection.json";

/**
 * Stable namespace for one signed-in account: provider origin + subject.
 * Changing either selects a different directory without touching the former.
 */
export function accountScopeKey(providerOrigin: string, subject: string): string {
	return JSON.stringify([providerOrigin, subject]);
}

export function accountScopeDirectoryName(scope: string): string {
	return createHash("sha256").update(scope).digest("hex");
}

export interface AccountSelection {
	readonly scope: string | null;
	readonly providerEndpoint: string | null;
}

export interface AccountDirectoryLayout {
	readonly agentDir: string;
	readonly selection: AccountSelection;
}

export function resolveAccountPartition(agentDir: string, selection: AccountSelection): string {
	if (!selection.scope) return joinPosix(agentDir, LOGGED_OUT_PARTITION);
	return joinPosix(agentDir, ACCOUNTS_PARTITION, accountScopeDirectoryName(selection.scope));
}

/**
 * Account-scoped directory for a well-known kind. Checkpoint / Evolution /
 * Recording / Evaluation hosts should call this so data lands in the
 * signed-in (or logged-out) partition.
 *
 * Migration strategy (owned by the host that first opens the agent dir):
 * 1. Existing files at `<agentDir>/<kind>` move into `logged-out/<kind>`
 *    unless a signed-in selection already exists, in which case they move
 *    into that account partition. Nothing is deleted.
 * 2. Subsequent opens never read unscoped leftovers as the live tree.
 * 3. Switching accounts never imports another partition.
 */
export function resolveAccountScopedDir(agentDir: string, kind: AccountScopeKind, selection: AccountSelection): string {
	const partition = resolveAccountPartition(agentDir, selection);
	if (kind === "root") return partition;
	return joinPosix(partition, kind);
}

export function defaultLoggedOutSelection(): AccountSelection {
	return { scope: null, providerEndpoint: null };
}

function joinPosix(...parts: string[]): string {
	return parts
		.filter((part) => part.length > 0)
		.join("/")
		.replace(/\\/g, "/");
}
