import { describe, expect, it } from "vitest";
import { GREYBOX_PLAYBACK_EXPRESSION, GREYBOX_TICK_EXPRESSION } from "../src/milestones/definitions";
import { loadMilestoneLedger } from "../src/milestones/store";
import {
	executeCreateProject,
	executeProbe,
	executeRecording,
	executeStartDevServer,
	executeVerifyMilestone,
} from "../src/tools/runtime";
import { createFakeSpawnHandle, createToolContext, MemoryFs } from "./helpers/memory-host";

describe("new session to playable greybox flow", () => {
	it("creates a project, scaffolds, records, evaluates a milestone, lists recordings and can revert a checkpoint", async () => {
		const cwd = "/tmp/harbour-run";
		const fs = new MemoryFs(cwd);
		const { ctx, storage, calls } = createToolContext({
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
		expect(calls.resolvedCwds).toContain(cwd);
		expect(calls.upserted[0]?.scope).toEqual({ kind: "project", projectKey: "eval-key" });
		const greybox = calls.upserted.find((item) => item.definition.id === "game-milestone:greybox");
		expect(greybox?.definition).toEqual(
			expect.objectContaining({
				id: "game-milestone:greybox",
				criteria: expect.arrayContaining([
					expect.objectContaining({
						verifier: expect.objectContaining({ kind: "command", command: "bun", args: ["run", "typecheck"], cwd }),
					}),
					expect.objectContaining({
						verifier: {
							kind: "assertion",
							source: "recording-telemetry",
							expression: GREYBOX_PLAYBACK_EXPRESSION,
						},
					}),
					expect.objectContaining({
						verifier: {
							kind: "assertion",
							source: "recording-telemetry",
							expression: GREYBOX_TICK_EXPRESSION,
						},
					}),
				]),
			}),
		);

		const recorded = (await executeRecording(ctx, { cwd, id: "s1" }, "record", {})) as { id: string; status: string };
		expect(recorded.id).toBe("rec-1");
		expect(recorded.status).toBe("ready");
		expect(calls.recordingStarts).toEqual([
			expect.objectContaining({ projectKey: "recording-key", sessionId: "s1", url: "http://127.0.0.1:5179/" }),
		]);
		expect(calls.recordingProbes.map((item) => item.kind)).toEqual(["tick", "input", "advance"]);
		expect(calls.recordingStops).toEqual(["rec-1"]);

		const verified = (await executeVerifyMilestone(ctx, { cwd, id: "s1" }, {
			operation_id: "op-greybox",
			milestone_id: "greybox",
			refuted: 0,
			confirmed: 1,
		})) as { attemptId: string; checkpointId: string; outcome: { kind: string } };
		expect(calls.runs).toEqual([
			{
				definitionId: "game-milestone:greybox",
				scope: { kind: "project", projectKey: "eval-key" },
				trigger: { kind: "milestone", ref: "op-greybox" },
			},
		]);
		expect(verified.attemptId).toBe("attempt-1");
		expect(verified.checkpointId).toBe("cp-1");
		expect(verified.outcome.kind).toBe("passed");
		expect(calls.checkpointLists).toEqual(["checkpoint-key"]);

		const listed = (await executeRecording(ctx, { cwd, id: "s1" }, "list_recordings", {})) as {
			recordings: Array<{ id: string; status: string }>;
		};
		expect(listed.recordings).toEqual([expect.objectContaining({ id: "rec-1", status: "ready" })]);
	});
});
