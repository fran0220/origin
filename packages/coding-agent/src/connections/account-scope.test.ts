import { describe, expect, it } from "vitest";
import {
	accountScopeDirectoryName,
	accountScopeKey,
	defaultLoggedOutSelection,
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
		expect(resolveAccountPartition("/home/u/.vetta/agent", defaultLoggedOutSelection())).toBe(
			"/home/u/.vetta/agent/logged-out",
		);
		expect(resolveAccountScopedDir("/home/u/.vetta/agent", "checkpoints", defaultLoggedOutSelection())).toBe(
			"/home/u/.vetta/agent/logged-out/checkpoints",
		);
		expect(resolveAccountScopedDir("/home/u/.vetta/agent", "evaluation", defaultLoggedOutSelection())).toBe(
			"/home/u/.vetta/agent/logged-out/evaluation",
		);
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
