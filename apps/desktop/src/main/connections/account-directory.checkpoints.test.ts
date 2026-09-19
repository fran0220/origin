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

describe("account-scoped checkpoint directories", () => {
	const directories: string[] = [];

	afterEach(() => {
		for (const directory of directories.splice(0)) {
			rmSync(directory, { recursive: true, force: true });
		}
	});

	it("isolates checkpoints by account and migrates leftover <agentDir>/checkpoints", () => {
		const agentDir = mkdtempSync(join(tmpdir(), "checkpoint-account-dir-"));
		directories.push(agentDir);
		const leftover = join(agentDir, "checkpoints", "home");
		mkdirSync(leftover, { recursive: true });
		writeFileSync(join(leftover, "mainline.jsonl"), '{"id":"cp-1"}\n');

		const loggedOutDir = resolveAccountScopedDir(agentDir, "checkpoints", defaultLoggedOutSelection());
		expect(loggedOutDir).toBe(join(agentDir, "logged-out", "checkpoints"));

		const accountA = {
			scope: accountScopeKey("https://api.example.com", "user-a"),
			providerEndpoint: "https://api.example.com",
		};
		const accountB = {
			scope: accountScopeKey("https://api.example.com", "user-b"),
			providerEndpoint: "https://api.example.com",
		};
		const accountADir = resolveAccountScopedDir(agentDir, "checkpoints", accountA);
		const accountBDir = resolveAccountScopedDir(agentDir, "checkpoints", accountB);
		expect(accountADir).toBe(join(agentDir, "accounts", accountScopeDirectoryName(accountA.scope), "checkpoints"));
		expect(accountADir).not.toBe(loggedOutDir);
		expect(accountADir).not.toBe(accountBDir);

		migrateUnscopedLegacyTrees(agentDir, defaultLoggedOutSelection());
		expect(existsSync(join(agentDir, "checkpoints"))).toBe(false);
		expect(readFileSync(join(loggedOutDir, "home", "mainline.jsonl"), "utf8")).toContain("cp-1");
	});
});
