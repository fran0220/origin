import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	accountScopeDirectoryName,
	accountScopeKey,
	defaultLoggedOutSelection,
	resolveAccountScopedDir,
} from "@origin/coding-agent/connections";
import { afterEach, describe, expect, it } from "vitest";
import { migrateUnscopedLegacyTrees } from "../connections/account-directory.js";

describe("account-scoped recording directories", () => {
	const directories: string[] = [];

	afterEach(() => {
		for (const directory of directories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("isolates recordings by account, logs out to logged-out, and migrates leftover <agentDir>/recordings", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "recording-account-dir-"));
		directories.push(agentDir);
		const leftover = join(agentDir, "recordings", "home", "rec_legacy");
		mkdirSync(leftover, { recursive: true });
		writeFileSync(join(leftover, "record.json"), '{"id":"rec_legacy"}\n');

		const loggedOutDir = resolveAccountScopedDir(agentDir, "recordings", defaultLoggedOutSelection());
		expect(loggedOutDir).toBe(join(agentDir, "logged-out", "recordings"));

		const accountA = {
			scope: accountScopeKey("https://api.example.com", "user-a"),
			providerEndpoint: "https://api.example.com",
		};
		const accountB = {
			scope: accountScopeKey("https://api.example.com", "user-b"),
			providerEndpoint: "https://api.example.com",
		};
		const accountADir = resolveAccountScopedDir(agentDir, "recordings", accountA);
		const accountBDir = resolveAccountScopedDir(agentDir, "recordings", accountB);
		expect(accountADir).toBe(join(agentDir, "accounts", accountScopeDirectoryName(accountA.scope), "recordings"));
		expect(accountADir).not.toBe(loggedOutDir);
		expect(accountADir).not.toBe(accountBDir);

		migrateUnscopedLegacyTrees(agentDir, defaultLoggedOutSelection());
		expect(existsSync(join(agentDir, "recordings"))).toBe(false);
		expect(readFileSync(join(loggedOutDir, "home", "rec_legacy", "record.json"), "utf8")).toContain("rec_legacy");
	});
});
