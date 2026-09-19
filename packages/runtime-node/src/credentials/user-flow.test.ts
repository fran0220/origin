import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OwnerOnlyFileCryptography, ownerOnlyKeyDirectory } from "./owner-only-cryptography.js";
import { createConnectionRelayHost } from "./relay.js";
import { connectionSecretRef } from "./types.js";
import { CredentialVault } from "./vault.js";

const ACCOUNT_TOKEN = "account-access-token-value";
const BYOK_KEY = "sk-test-byok-secret-value";
const SIGNED_IN = "origin";

describe("Connection user flow", () => {
	const servers: Array<{ close: () => Promise<void> }> = [];

	afterEach(async () => {
		await Promise.all(servers.splice(0).map((server) => server.close()));
	});

	it("登录出现 Origin Connection，粘 BYOK Key 后可转发，登出后仅 Origin 不可用", async () => {
		const root = mkdtempSync(join(tmpdir(), "origin-flow-"));
		const vault = new CredentialVault(root, new OwnerOnlyFileCryptography(ownerOnlyKeyDirectory(root)));
		vault.put(connectionSecretRef(SIGNED_IN), ACCOUNT_TOKEN, { kind: "connection-secret", consumer: SIGNED_IN });
		vault.put(connectionSecretRef("openai"), BYOK_KEY, { kind: "connection-secret", consumer: "openai" });
		expect(vault.has(connectionSecretRef(SIGNED_IN))).toBe(true);

		const captured: string[] = [];
		const upstream = createServer((request, response) => {
			captured.push(String(request.headers.authorization));
			response.writeHead(200, { "content-type": "application/json" });
			response.end(JSON.stringify({ ok: true, model: "gpt-test" }));
		});
		await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
		const address = upstream.address();
		if (!address || typeof address === "string") throw new Error("upstream port");
		const upstreamOrigin = `http://127.0.0.1:${address.port}`;
		servers.push({
			close: () =>
				new Promise((resolve, reject) => {
					upstream.close((error) => (error ? reject(error) : resolve()));
				}),
		});

		const relay = createConnectionRelayHost();
		servers.push(relay);
		await relay.configure([
			{ connectionId: SIGNED_IN, upstreamOrigin, prefixes: ["/v1"], secret: ACCOUNT_TOKEN },
			{ connectionId: "openai", upstreamOrigin, prefixes: ["/v1"], secret: BYOK_KEY },
		]);

		const byok = relay.route("openai");
		if (!byok) throw new Error("missing byok route");
		const denied = await fetch(`${byok.origin}/v1/chat/completions`, {
			method: "POST",
			headers: { Authorization: "Bearer wrong", "content-type": "application/json" },
			body: JSON.stringify({ model: "gpt-test" }),
		});
		expect(denied.status).toBe(401);

		const allowed = await fetch(`${byok.origin}/v1/chat/completions`, {
			method: "POST",
			headers: { Authorization: `Bearer ${byok.bearer}`, "content-type": "application/json" },
			body: JSON.stringify({ model: "gpt-test" }),
		});
		expect(allowed.ok).toBe(true);
		expect(captured.at(-1)).toBe(`Bearer ${BYOK_KEY}`);
		const body = JSON.stringify(await allowed.json());
		expect(body).not.toContain(BYOK_KEY);
		expect(body).not.toContain(ACCOUNT_TOKEN);

		vault.remove(connectionSecretRef(SIGNED_IN));
		await relay.configure([{ connectionId: "openai", upstreamOrigin, prefixes: ["/v1"], secret: BYOK_KEY }]);
		expect(relay.route(SIGNED_IN)).toBeUndefined();
		expect(relay.route("openai")?.bearer).toBeTruthy();
		expect(vault.has(connectionSecretRef(SIGNED_IN))).toBe(false);
		expect(vault.has(connectionSecretRef("openai"))).toBe(true);
	});
});
