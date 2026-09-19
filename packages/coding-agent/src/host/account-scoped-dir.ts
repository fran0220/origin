import { existsSync, readFileSync } from "node:fs";
import {
	type AccountScopeKind,
	type AccountSelection,
	accountSelectionFilePath,
	defaultLoggedOutSelection,
	parseAccountSelection,
	resolveAccountScopedDir,
} from "../connections/account-scope.js";

/**
 * Node hosts (CLI / SDK) do not keep a live account directory service.
 * They read the same `account-selection.json` Desktop writes, and fall back
 * to the logged-out partition when the file is missing or unreadable.
 */
export function readNodeAccountSelection(agentDir: string): AccountSelection {
	const path = accountSelectionFilePath(agentDir);
	if (!existsSync(path)) return defaultLoggedOutSelection();
	try {
		return parseAccountSelection(JSON.parse(readFileSync(path, "utf8")) as unknown);
	} catch {
		return defaultLoggedOutSelection();
	}
}

export function resolveNodeAccountScopedDir(agentDir: string, kind: AccountScopeKind): string {
	return resolveAccountScopedDir(agentDir, kind, readNodeAccountSelection(agentDir));
}
