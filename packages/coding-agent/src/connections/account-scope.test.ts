import { describe, expect, it } from "vitest";
import {
	accountScopeDirectoryName,
	accountScopeKey,
	accountSelectionFilePath,
	defaultLoggedOutSelection,
	parseAccountSelection,
	resolveAccountPartition,
	resolveAccountScopedDir,
} from "./account-scope.js";

describe("account-scoped directories", () => {
	it("hashes the account namespace so the directory name never contains identity", () => {
		const scope = accountScopeKey("https://api.example.com", "user-1");
		const name = accountScopeDirectoryName(scope);
		expect(name).toMatch(/^[0-9a-f]{64}$/);
		expect(name).not.toContain("user-1");
		expect(name).not.toContain("example.com");
	});

	it("puts logged-out data in a dedicated partition", () => {
		expect(resolveAccountPartition("/home/u/.origin/agent", defaultLoggedOutSelection())).toBe(
			"/home/u/.origin/agent/logged-out",
		);
		expect(resolveAccountScopedDir("/home/u/.origin/agent", "checkpoints", defaultLoggedOutSelection())).toBe(
			"/home/u/.origin/agent/logged-out/checkpoints",
		);
		expect(resolveAccountScopedDir("/home/u/.origin/agent", "evaluation", defaultLoggedOutSelection())).toBe(
			"/home/u/.origin/agent/logged-out/evaluation",
		);
	});

	it("puts evolution under logged-out until an account is selected, then isolates each account", () => {
		const agentDir = "/home/u/.origin/agent";
		expect(resolveAccountScopedDir(agentDir, "evolution", defaultLoggedOutSelection())).toBe(
			"/home/u/.origin/agent/logged-out/evolution",
		);
		const alice = {
			scope: accountScopeKey("https://api.example.com", "alice"),
			providerEndpoint: "https://api.example.com",
		};
		const bob = {
			scope: accountScopeKey("https://api.example.com", "bob"),
			providerEndpoint: "https://api.example.com",
		};
		const aliceDir = resolveAccountScopedDir(agentDir, "evolution", alice);
		const bobDir = resolveAccountScopedDir(agentDir, "evolution", bob);
		expect(aliceDir).toContain("/accounts/");
		expect(aliceDir.endsWith("/evolution")).toBe(true);
		expect(aliceDir).not.toBe(bobDir);
		expect(aliceDir).not.toBe(resolveAccountScopedDir(agentDir, "evolution", defaultLoggedOutSelection()));
	});

	it("parses account-selection.json and treats missing or empty fields as logged-out", () => {
		expect(parseAccountSelection(undefined)).toEqual(defaultLoggedOutSelection());
		expect(parseAccountSelection({ scope: "", providerEndpoint: "" })).toEqual(defaultLoggedOutSelection());
		expect(parseAccountSelection({ scope: "s", providerEndpoint: "https://api.example.com" })).toEqual({
			scope: "s",
			providerEndpoint: "https://api.example.com",
		});
		expect(accountSelectionFilePath("/home/u/.origin/agent")).toBe("/home/u/.origin/agent/account-selection.json");
	});

	it("isolates signed-in accounts from each other and from logged-out data", () => {
		const a = { scope: accountScopeKey("https://api.example.com", "a"), providerEndpoint: "https://api.example.com" };
		const b = { scope: accountScopeKey("https://api.example.com", "b"), providerEndpoint: "https://api.example.com" };
		expect(resolveAccountPartition("/agent", a)).not.toBe(resolveAccountPartition("/agent", b));
		expect(resolveAccountPartition("/agent", a)).not.toBe(
			resolveAccountPartition("/agent", defaultLoggedOutSelection()),
		);
		expect(resolveAccountScopedDir("/agent", "evaluation", a)).not.toBe(
			resolveAccountScopedDir("/agent", "evaluation", b),
		);
		expect(resolveAccountScopedDir("/agent", "evaluation", a)).not.toBe(
			resolveAccountScopedDir("/agent", "evaluation", defaultLoggedOutSelection()),
		);
	});
});
