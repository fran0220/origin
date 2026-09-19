import { describe, expect, it } from "vitest";
import { startDevServerWithSpawner, viteDevArgs } from "../src/stage/dev-server";
import { createFakeSpawnHandle } from "./helpers/memory-host";

describe("dev server port retry", () => {
	it("asks the host for an allocated port and passes --strictPort", () => {
		expect(viteDevArgs()).toEqual(["x", "--bun", "vite", "--host", "127.0.0.1", "--port", "{{PORT}}", "--strictPort"]);
	});

	it("retries when the allocated port is already in use", async () => {
		const calls: number[] = [];
		const server = await startDevServerWithSpawner(async (_file, _args, options) => {
			calls.push(1);
			if (calls.length === 1) {
				return createFakeSpawnHandle(5173, false, "Error: Port 5173 is already in use");
			}
			expect(options?.allocatePort).toBe(true);
			return createFakeSpawnHandle(5180, true, "ready");
		}, "/tmp/game");
		expect(calls).toHaveLength(2);
		expect(server.port).toBe(5180);
		expect(server.url).toBe("http://127.0.0.1:5180/");
		await server.stop();
	});

	it("reuses a running server for the same cwd", async () => {
		let spawned = 0;
		const spawn = async () => {
			spawned += 1;
			return createFakeSpawnHandle(5190);
		};
		const first = await startDevServerWithSpawner(spawn, "/tmp/reuse");
		const second = await startDevServerWithSpawner(spawn, "/tmp/reuse");
		expect(first).toBe(second);
		expect(spawned).toBe(1);
		await first.stop();
	});
});
