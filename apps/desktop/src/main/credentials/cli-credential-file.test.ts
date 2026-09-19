import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { syncCredentialFile } from "./cli-credential-file.js";

vi.mock("../logger.js", () => ({ getAppLogger: () => ({ warn: vi.fn() }) }));

const roots: string[] = [];
afterEach(() => {
	vi.unstubAllEnvs();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("publishes the relay credential, rotates it, and removes the external contract on sign-out", () => {
	const root = mkdtempSync(join(tmpdir(), "origin-cli-credential-"));
	roots.push(root);
	vi.stubEnv("ORIGIN_HOME", root);
	const path = join(root, "auth.json");
	syncCredentialFile("relay-first", "http://127.0.0.1:12345/");
	expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
		baseUrl: "http://127.0.0.1:12345",
		token: "relay-first",
		relay: true,
	});
	syncCredentialFile("relay-rotated", "http://127.0.0.1:12346");
	expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
		baseUrl: "http://127.0.0.1:12346",
		token: "relay-rotated",
		relay: true,
	});
	if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
	syncCredentialFile(undefined);
	expect(existsSync(path)).toBe(false);
});
