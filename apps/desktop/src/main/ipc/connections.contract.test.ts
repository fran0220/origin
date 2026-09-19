import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("renderer IPC never returns plaintext tokens", () => {
	it("get-server-token only returns a signed-in descriptor", () => {
		const source = readFileSync(join(import.meta.dirname, "../cloud/auth-session.ts"), "utf8");
		expect(source).toContain("hasAccountSession() ? { signedIn: true } : undefined");
		expect(source).not.toMatch(/return readAccountAccessToken\(\)/);
	});

	it("oauth callback payload is signedIn only", () => {
		const source = readFileSync(join(import.meta.dirname, "../cloud/index.ts"), "utf8");
		expect(source).toContain('send("origin:auth:oauth-callback", { signedIn: true })');
		expect(source).not.toContain("token: tokens.token");
	});

	it("connections list returns ConnectionReadState without secret fields", () => {
		const types = readFileSync(
			join(import.meta.dirname, "../../../../../packages/coding-agent/src/connections/types.ts"),
			"utf8",
		);
		expect(types).toContain("export interface ConnectionDescriptor");
		expect(types).toContain("intentionally not representable");
		expect(types).not.toMatch(/secret\??:/);
		expect(types).not.toMatch(/apiKey\??:/);
	});
});
