import { describe, expect, it } from "vitest";
import { executeCreateProject, executeProbe, executeStartDevServer } from "../src/tools/runtime";
import { loadMilestoneLedger } from "../src/milestones/store";
import { createFakeSpawnHandle, createToolContext, MemoryFs } from "./helpers/memory-host";

describe("new session to playable greybox flow", () => {
	it("selects a type card idea, lands canvas2d, starts the dev server, reads probe state and persists milestones", async () => {
		const cwd = "/tmp/harbour-run";
		const fs = new MemoryFs(cwd);
		const { ctx, storage } = createToolContext({
			cwd,
			fs,
			spawn: async (_file: string, args?: string[], options?: { allocatePort?: boolean }) => {
				expect(options?.allocatePort).toBe(true);
				expect(args).toContain("--strictPort");
				return createFakeSpawnHandle(5179);
			},
			capture: {
				async offscreen() {
					return {
						dataUrl: "data:image/png;base64,AAA",
						scaleFactor: 1,
						probe: { ok: true, result: { tick: 0, timings: { step: 0, render: 0, entities: 0, draws: 0 } } },
					};
				},
				async releaseOffscreen() {},
			},
		});

		const created = (await executeCreateProject(ctx, { cwd, id: "s1" }, {
			idea: "a maze I can walk",
			genre: "puzzle-board",
			substrate: "canvas2d",
			name: "harbour-run",
		})) as { ok: boolean; scaffold: { written: string[] }; milestones: Array<{ id: string }> };

		expect(created.ok).toBe(true);
		expect(created.scaffold.written).toContain("package.json");
		expect(created.scaffold.written).toContain("src/core/probe-bridge.ts");
		expect((await fs.readFile(`${cwd}/package.json`)).content).toContain('"name": "harbour-run"');
		expect((await fs.readFile(`${cwd}/.origin/opening.json`)).content).toContain("a maze I can walk");

		const started = (await executeStartDevServer(ctx, { cwd, id: "s1" })) as { url: string; port: number };
		expect(started.port).toBe(5179);
		expect(started.url).toBe("http://127.0.0.1:5179/");

		const state = (await executeProbe(ctx, { cwd, id: "s1" }, "state")) as {
			ok: boolean;
			result: { tick: number };
		};
		expect(state.ok).toBe(true);
		expect(state.result.tick).toBe(0);

		const ledger = await loadMilestoneLedger(storage, cwd);
		expect(ledger.definitions.map((definition) => definition.id)).toEqual([
			"game-milestone:greybox",
			"game-milestone:delivery",
		]);
		expect(ledger.definitions[0]?.criteria.some((criterion) => criterion.verifier?.kind === "command")).toBe(true);
		expect(ledger.definitions[0]?.criteria.some((criterion) => criterion.verifier?.kind === "telemetry")).toBe(true);
	});
});
