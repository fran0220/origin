import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { scrubSecrets } from "./secret-scrub.js";

export interface RelayRoute {
	readonly connectionId: string;
	readonly origin: string;
	readonly bearer: string;
	readonly upstreamOrigin: string;
	readonly prefixes: readonly string[];
}

export interface RelayUpstream {
	readonly connectionId: string;
	readonly upstreamOrigin: string;
	readonly prefixes: readonly string[];
	readonly secret: string;
	readonly headerName?: string;
}

export interface ConnectionRelayHost {
	readonly origin: string;
	route(connectionId: string): RelayRoute | undefined;
	routes(): readonly RelayRoute[];
	configure(upstreams: readonly RelayUpstream[]): Promise<void>;
	close(): Promise<void>;
}

const DEFAULT_PREFIXES = ["/v1"];

/**
 * Process-local loopback relay. Runtimes, plugins, subagents and MCP children
 * receive only `origin` + a short-lived bearer; the upstream key is injected
 * here and never appears in the route, the response, or logs.
 */
export function createConnectionRelayHost(
	options: { readonly fetch?: typeof globalThis.fetch; readonly log?: (message: string) => void } = {},
): ConnectionRelayHost {
	return new LoopbackRelayHost(options.fetch ?? globalThis.fetch, options.log);
}

class LoopbackRelayHost implements ConnectionRelayHost {
	private server: Server | undefined;
	private originValue = "";
	private readonly upstreams = new Map<string, LiveUpstream>();
	private readonly bearers = new Map<string, string>();

	constructor(
		private readonly fetchImpl: typeof globalThis.fetch,
		private readonly log?: (message: string) => void,
	) {}

	get origin(): string {
		return this.originValue;
	}

	route(connectionId: string): RelayRoute | undefined {
		const live = this.upstreams.get(connectionId);
		if (!live || !this.originValue) return undefined;
		return {
			connectionId,
			origin: this.originValue,
			bearer: live.bearer,
			upstreamOrigin: live.upstreamOrigin,
			prefixes: live.prefixes,
		};
	}

	routes(): RelayRoute[] {
		return [...this.upstreams.keys()].flatMap((id) => {
			const route = this.route(id);
			return route ? [route] : [];
		});
	}

	async configure(upstreams: readonly RelayUpstream[]): Promise<void> {
		await this.ensureListening();
		const nextIds = new Set(upstreams.map((item) => item.connectionId));
		for (const existing of [...this.upstreams.keys()]) {
			if (!nextIds.has(existing)) {
				const live = this.upstreams.get(existing);
				if (live) this.bearers.delete(live.bearer);
				this.upstreams.delete(existing);
			}
		}
		for (const upstream of upstreams) {
			const current = this.upstreams.get(upstream.connectionId);
			const bearer = current?.bearer ?? createRelayBearer();
			if (current) this.bearers.delete(current.bearer);
			this.bearers.set(bearer, upstream.connectionId);
			this.upstreams.set(upstream.connectionId, {
				...upstream,
				prefixes: normalizePrefixes(upstream.prefixes),
				headerName: upstream.headerName ?? "authorization",
				bearer,
			});
		}
	}

	async close(): Promise<void> {
		const server = this.server;
		this.server = undefined;
		this.originValue = "";
		this.upstreams.clear();
		this.bearers.clear();
		if (!server) return;
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) reject(error);
				else resolve();
			});
		});
	}

	private async ensureListening(): Promise<void> {
		if (this.server) return;
		const server = createServer((request, response) => {
			void this.handle(request, response);
		});
		this.server = server;
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => {
				const address = server.address() as AddressInfo;
				this.originValue = `http://127.0.0.1:${address.port}`;
				resolve();
			});
		});
	}

	private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
		try {
			const url = new URL(request.url ?? "/", this.originValue || "http://127.0.0.1");
			const connectionId = this.bearers.get(bearerOf(request));
			if (!connectionId) {
				writeJson(response, 401, { error: "invalid_relay_bearer" });
				return;
			}
			const live = this.upstreams.get(connectionId);
			if (!live) {
				writeJson(response, 404, { error: "unknown_connection" });
				return;
			}
			if (!pathAllowed(url.pathname, live.prefixes)) {
				writeJson(response, 404, { error: "path_not_relayed" });
				return;
			}
			const upstreamUrl = `${live.upstreamOrigin}${url.pathname}${url.search}`;
			const headers = new Headers();
			for (const [name, value] of Object.entries(request.headers)) {
				if (value === undefined) continue;
				if (name.toLowerCase() === "host" || name.toLowerCase() === "authorization") continue;
				headers.set(name, Array.isArray(value) ? value.join(", ") : value);
			}
			headers.set(
				live.headerName,
				live.headerName.toLowerCase() === "authorization" ? `Bearer ${live.secret}` : live.secret,
			);
			const body = await readRequestBody(request);
			const upstream = await this.fetchImpl(upstreamUrl, {
				method: request.method,
				headers,
				body:
					body.length > 0 && request.method !== "GET" && request.method !== "HEAD"
						? new Uint8Array(body)
						: undefined,
			});
			response.writeHead(upstream.status, sanitizeResponseHeaders(upstream.headers, live.secret));
			const payload = Buffer.from(await upstream.arrayBuffer());
			if (payload.includes(Buffer.from(live.secret))) {
				this.log?.(scrubSecrets("relay refused to forward a response that contained the upstream secret"));
				response.end();
				return;
			}
			response.end(payload);
		} catch (error) {
			this.log?.(scrubSecrets(error instanceof Error ? error.message : String(error)));
			if (!response.headersSent) writeJson(response, 502, { error: "relay_upstream_failed" });
			else response.end();
		}
	}
}

interface LiveUpstream extends RelayUpstream {
	readonly bearer: string;
	readonly headerName: string;
}

function createRelayBearer(): string {
	return `vr_${randomBytes(24).toString("base64url")}`;
}

function bearerOf(request: IncomingMessage): string {
	const header = request.headers.authorization;
	if (typeof header !== "string") return "";
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match?.[1] ?? "";
}

function normalizePrefixes(prefixes: readonly string[]): readonly string[] {
	const next = prefixes.length > 0 ? prefixes : DEFAULT_PREFIXES;
	return next.map((prefix) => (prefix.startsWith("/") ? prefix : `/${prefix}`));
}

function pathAllowed(pathname: string, prefixes: readonly string[]): boolean {
	return prefixes.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(prefix),
	);
}

function sanitizeResponseHeaders(headers: Headers, secret: string): Record<string, string> {
	const next: Record<string, string> = {};
	headers.forEach((value, name) => {
		const lower = name.toLowerCase();
		if (lower === "transfer-encoding" || lower === "connection") return;
		if (value.includes(secret)) return;
		next[name] = value;
	});
	return next;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks);
}
