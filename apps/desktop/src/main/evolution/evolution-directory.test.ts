import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAccountDirectoryService, resetAccountDirectoryServiceForTests } from "../connections/account-directory.js";
import { resolveDesktopEvolutionLedgerRoot } from "./evolution-service.js";

const roots: string[] = [];

afterEach(async () => {
	resetAccountDirectoryServiceForTests();
	await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Desktop evolution ledger root", () => {
	it("puts the ledger under logged-out until an account is selected, then isolates each account", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "origin-desktop-evolution-"));
		roots.push(agentDir);
		const directory = getAccountDirectoryService(agentDir);

		expect(resolveDesktopEvolutionLedgerRoot(agentDir)).toBe(join(agentDir, "logged-out", "evolution"));
		expect(directory.selection()).toEqual({ scope: null, providerEndpoint: null });

		directory.admit("https://api.example.com", "alice", "https://api.example.com");
		const aliceDir = resolveDesktopEvolutionLedgerRoot(agentDir);
		directory.admit("https://api.example.com", "bob", "https://api.example.com");
		const bobDir = resolveDesktopEvolutionLedgerRoot(agentDir);

		expect(aliceDir).toContain(join(agentDir, "accounts"));
		expect(aliceDir.endsWith(join("evolution"))).toBe(true);
		expect(aliceDir).not.toBe(bobDir);
		expect(aliceDir).not.toBe(join(agentDir, "logged-out", "evolution"));

		directory.selectLoggedOut();
		expect(resolveDesktopEvolutionLedgerRoot(agentDir)).toBe(join(agentDir, "logged-out", "evolution"));
	});
});
