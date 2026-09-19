import { createServer as createHttpServer } from "node:http";
import { type AddressInfo, createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createConnectionRelayHost } from "./relay.js";

const hosts: Array<{ close(): Promise<void> }> = [];
const servers: Array<{ close(): void }> = [];

afterEach(async () => {
	while (hosts.length > 0) await hosts.pop()?.close();
	while (servers.length > 0) {
		await new Promise<void>((resolve) => {
			servers.pop()?.close();
			resolve();
		});
	}
});

describe("loopback connection relay", () => {
	it("rejects a request with the wrong bearer and never forwards the upstream key", async () => {
		const upstream = await listenUpstream("sk-upstream-secret");
		const relay = createConnectionRelayHost({});
		hosts.push(relay);
		await relay.configure([
			{
				connectionId: "openai",
				upstreamOrigin: upstream.origin,
				prefixes: ["/v1"],
				secret: "sk-upstream-secret",
			},
		]);
		const route = relay.route("openai");
		if (!route) throw new Error("expected relay route");

		const denied = await fetch(`${route.origin}/v1/chat/completions`, {
			method: "POST",
			headers: { authorization: "Bearer wrong", "content-type": "application/json" },
			body: "{}",
		});
		expect(denied.status).toBe(401);
		expect(await denied.text()).not.toContain("sk-upstream-secret");
	});

	it("injects the upstream key for a valid bearer and keeps it out of the response", async () => {
		const seen: string[] = [];
		const upstream = await listenUpstream("sk-upstream-secret", seen);
		const relay = createConnectionRelayHost({});
		hosts.push(relay);
		await relay.configure([
			{
				connectionId: "openai",
				upstreamOrigin: upstream.origin,
				prefixes: ["/v1"],
				secret: "sk-upstream-secret",
			},
		]);
		const route = relay.route("openai");
		if (!route) throw new Error("expected relay route");
		expect(route.bearer).not.toBe("sk-upstream-secret");
		expect(JSON.stringify(route)).not.toContain("sk-upstream-secret");

		const allowed = await fetch(`${route.origin}/v1/chat/completions`, {
			method: "POST",
			headers: { authorization: `Bearer ${route.bearer}`, "content-type": "application/json" },
			body: JSON.stringify({ model: "gpt-4o" }),
		});
		expect(allowed.status).toBe(200);
		const body = await allowed.text();
		expect(body).toBe('{"ok":true}');
		expect(body).not.toContain("sk-upstream-secret");
		expect(seen.some((header) => header.includes("sk-upstream-secret"))).toBe(true);
	});
});

async function listenUpstream(secret: string, seen: string[] = []): Promise<{ origin: string }> {
	const server = createHttpServer((request, response) => {
		seen.push(String(request.headers.authorization ?? ""));
		if (request.headers.authorization !== `Bearer ${secret}`) {
			response.writeHead(401);
			response.end("no");
			return;
		}
		response.writeHead(200, { "content-type": "application/json" });
		response.end(JSON.stringify({ ok: true }));
	});
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
	const address = server.address() as AddressInfo;
	return { origin: `http://127.0.0.1:${address.port}` };
}

void createServer;
