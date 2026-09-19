import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ACCOUNT_SELECTION_FILE, accountScopeKey } from "../connections/account-scope.js";
import { readNodeAccountSelection, resolveNodeAccountScopedDir } from "./account-scoped-dir.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Node account-scoped evolution root", () => {
	it("puts evolution under logged-out when no account is selected", async () => {
		const agentDir = await temporaryAgentDir();
		expect(resolveNodeAccountScopedDir(agentDir, "evolution")).toBe(join(agentDir, "logged-out", "evolution"));
		expect(readNodeAccountSelection(agentDir)).toEqual({ scope: null, providerEndpoint: null });
	});

	it("isolates evolution directories after switching accounts", async () => {
		const agentDir = await temporaryAgentDir();
		const alice = {
			scope: accountScopeKey("https://api.example.com", "alice"),
			providerEndpoint: "https://api.example.com",
		};
		const bob = {
			scope: accountScopeKey("https://api.example.com", "bob"),
			providerEndpoint: "https://api.example.com",
		};
		await writeFile(join(agentDir, ACCOUNT_SELECTION_FILE), JSON.stringify(alice), "utf8");
		const aliceDir = resolveNodeAccountScopedDir(agentDir, "evolution");
		await writeFile(join(agentDir, ACCOUNT_SELECTION_FILE), JSON.stringify(bob), "utf8");
		const bobDir = resolveNodeAccountScopedDir(agentDir, "evolution");
		expect(aliceDir).toContain(join(agentDir, "accounts"));
		expect(aliceDir.endsWith(join("evolution"))).toBe(true);
		expect(aliceDir).not.toBe(bobDir);
		expect(aliceDir).not.toBe(join(agentDir, "logged-out", "evolution"));
		expect(readNodeAccountSelection(agentDir)).toEqual(bob);
	});

	it("treats a corrupt selection file as logged-out", async () => {
		const agentDir = await temporaryAgentDir();
		await writeFile(join(agentDir, ACCOUNT_SELECTION_FILE), "{not-json", "utf8");
		expect(resolveNodeAccountScopedDir(agentDir, "evolution")).toBe(join(agentDir, "logged-out", "evolution"));
	});
});

async function temporaryAgentDir(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "vetta-evolution-account-"));
	roots.push(root);
	return root;
}
