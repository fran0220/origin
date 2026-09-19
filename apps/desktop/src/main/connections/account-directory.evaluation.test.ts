import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	accountScopeDirectoryName,
	accountScopeKey,
	defaultLoggedOutSelection,
	resolveAccountScopedDir,
} from "@vetta/coding-agent/connections";
import { afterEach, describe, expect, it } from "vitest";
import { migrateUnscopedLegacyTrees } from "./account-directory.js";

describe("account-scoped evaluation directories", () => {
	const directories: string[] = [];

	afterEach(() => {
		for (const directory of directories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("isolates evaluation ledgers by account and migrates leftover <agentDir>/evaluation", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "evaluation-account-dir-"));
		directories.push(agentDir);
		const leftover = join(agentDir, "evaluation", "global");
		mkdirSync(leftover, { recursive: true });
		writeFileSync(join(leftover, "definitions.jsonl"), '{"id":"def-1"}\n');

		const loggedOutDir = resolveAccountScopedDir(agentDir, "evaluation", defaultLoggedOutSelection());
		expect(loggedOutDir).toBe(join(agentDir, "logged-out", "evaluation"));

		const accountA = {
			scope: accountScopeKey("https://api.example.com", "user-a"),
			providerEndpoint: "https://api.example.com",
		};
		const accountB = {
			scope: accountScopeKey("https://api.example.com", "user-b"),
			providerEndpoint: "https://api.example.com",
		};
		const accountADir = resolveAccountScopedDir(agentDir, "evaluation", accountA);
		const accountBDir = resolveAccountScopedDir(agentDir, "evaluation", accountB);
		expect(accountADir).toBe(join(agentDir, "accounts", accountScopeDirectoryName(accountA.scope), "evaluation"));
		expect(accountADir).not.toBe(loggedOutDir);
		expect(accountADir).not.toBe(accountBDir);

		migrateUnscopedLegacyTrees(agentDir, defaultLoggedOutSelection());
		expect(existsSync(join(agentDir, "evaluation"))).toBe(false);
		expect(readFileSync(join(loggedOutDir, "global", "definitions.jsonl"), "utf8")).toContain("def-1");
	});
});
