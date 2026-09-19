import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { DEFAULT_SERVER_URL } from "../../constants.js";
import { readAccountAccessToken } from "../../credentials/account-token-store.js";
import { getAppLogger } from "../../logger.js";

const log = getAppLogger("sse-proxy");
const TICKET_TTL_MS = 60_000;

interface LiveTicket {
	readonly token: string;
	readonly expiresAt: number;
}

let server: Server | undefined;
let origin = "";
const tickets = new Map<string, LiveTicket>();

export async function issueAccountSseUrl(): Promise<{ url: string } | undefined> {
	const token = readAccountAccessToken();
	if (!token) return undefined;
	await ensureListening();
	const ticket = randomBytes(18).toString("base64url");
	tickets.set(ticket, { token, expiresAt: Date.now() + TICKET_TTL_MS });
	return { url: `${origin}/t/${ticket}/events/stream` };
}

export async function closeAccountSseProxy(): Promise<void> {
	const current = server;
	server = undefined;
	origin = "";
	tickets.clear();
	if (!current) return;
	await new Promise<void>((resolve, reject) => {
		current.close((error) => {
			if (error) reject(error);
			else resolve();
		});
	});
}

async function ensureListening(): Promise<void> {
	if (server) return;
	const next = createServer((request, response) => {
		void handle(request, response);
	});
	server = next;
	await new Promise<void>((resolve, reject) => {
		next.once("error", reject);
		next.listen(0, "127.0.0.1", () => {
			const address = next.address() as AddressInfo;
			origin = `http://127.0.0.1:${address.port}`;
			resolve();
		});
	});
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
	const url = new URL(request.url ?? "/", origin || "http://127.0.0.1");
	const match = /^\/t\/([^/]+)\/events\/stream$/.exec(url.pathname);
	if (!match?.[1]) {
		response.writeHead(404).end();
		return;
	}
	const ticket = tickets.get(match[1]);
	tickets.delete(match[1]);
	if (!ticket || ticket.expiresAt < Date.now()) {
		response.writeHead(401).end();
		return;
	}
	const upstream = `${DEFAULT_SERVER_URL.replace(/\/+$/, "")}/events/stream`;
	try {
		const proxied = await fetch(upstream, {
			headers: {
				Accept: request.headers.accept ?? "text/event-stream",
				Authorization: `Bearer ${ticket.token}`,
			},
		});
		response.writeHead(proxied.status, {
			"content-type": proxied.headers.get("content-type") ?? "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
		});
		if (!proxied.body) {
			response.end();
			return;
		}
		const reader = proxied.body.getReader();
		const pump = async (): Promise<void> => {
			const chunk = await reader.read();
			if (chunk.done) {
				response.end();
				return;
			}
			response.write(Buffer.from(chunk.value));
			await pump();
		};
		request.on("close", () => {
			void reader.cancel();
		});
		await pump();
	} catch (error) {
		log.warn("SSE proxy failed:", error);
		if (!response.headersSent) response.writeHead(502).end();
		else response.end();
	}
}
