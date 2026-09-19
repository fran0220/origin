import type { PluginCommandSpawnHandle, PluginContext } from "@vetta-org/plugin-sdk";
import { updateProject } from "../store/project-store";

export const DEV_SERVER_RETRY_LIMIT = 3;
export const DEFAULT_DEV_HOST = "127.0.0.1";

export interface SpawnRequest {
	file: string;
	args: string[];
	options: { cwd?: string; env?: Record<string, string>; allocatePort?: boolean };
}

export type Spawner = (file: string, args?: string[], options?: SpawnRequest["options"]) => Promise<PluginCommandSpawnHandle>;

export interface DevServerHandle {
	cwd: string;
	port: number;
	url: string;
	spawnId: string;
	stop(): Promise<void>;
}

const servers = new Map<string, DevServerHandle>();

function isPortBusy(output: string): boolean {
	return /already in use|EADDRINUSE|strictPort/i.test(output);
}

export function viteDevArgs(portToken = "{{PORT}}"): string[] {
	return ["x", "--bun", "vite", "--host", DEFAULT_DEV_HOST, "--port", portToken, "--strictPort"];
}

export async function startDevServerWithSpawner(
	spawn: Spawner,
	cwd: string,
	retries = DEV_SERVER_RETRY_LIMIT,
): Promise<DevServerHandle> {
	const existing = servers.get(cwd);
	if (existing) return existing;

	let lastError = "failed to start the game dev server";
	for (let attempt = 0; attempt < retries; attempt += 1) {
		const handle = await spawn("bun", viteDevArgs(), { cwd, allocatePort: true });
		if (handle.port === undefined) {
			await handle.stop();
			throw new Error("host did not allocate a port for the game stage");
		}
		const status = await handle.status();
		if (!status.running && isPortBusy(status.recentOutput)) {
			await handle.stop();
			lastError = status.recentOutput || "allocated port was already in use";
			continue;
		}
		const server: DevServerHandle = {
			cwd,
			port: handle.port,
			url: `http://${DEFAULT_DEV_HOST}:${handle.port}/`,
			spawnId: handle.spawnId,
			stop: async () => {
				servers.delete(cwd);
				await handle.stop();
			},
		};
		servers.set(cwd, server);
		void handle.onExit(() => {
			if (servers.get(cwd) === server) servers.delete(cwd);
		});
		return server;
	}
	throw new Error(lastError);
}

export async function startDevServer(ctx: PluginContext, cwd: string): Promise<DevServerHandle> {
	const server = await startDevServerWithSpawner(ctx.command.spawn.bind(ctx.command), cwd);
	await updateProject(ctx.storage, cwd, (record) => {
		record.stage = {
			running: true,
			url: server.url,
			port: server.port,
			tick: record.stage.tick,
			lastFrameAt: record.stage.lastFrameAt,
			probeReady: false,
		};
		return record;
	});
	return server;
}

export async function stopDevServer(ctx: PluginContext, cwd: string): Promise<void> {
	const server = servers.get(cwd);
	if (server) await server.stop();
	await updateProject(ctx.storage, cwd, (record) => {
		record.stage = {
			running: false,
			url: null,
			port: null,
			tick: record.stage.tick,
			lastFrameAt: record.stage.lastFrameAt,
			probeReady: false,
		};
		return record;
	});
}

export function getDevServer(cwd: string): DevServerHandle | null {
	return servers.get(cwd) ?? null;
}

export async function stopAllDevServers(): Promise<void> {
	await Promise.all([...servers.values()].map((server) => server.stop()));
}
