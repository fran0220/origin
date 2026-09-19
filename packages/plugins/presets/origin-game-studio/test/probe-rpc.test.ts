// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { installProbe } from "../assets/game-scaffold/shared/src/core/probe";
import { installProbeBridge } from "../assets/game-scaffold/shared/src/core/probe-bridge";
import { postProbe } from "../src/probe/protocol";
import { callProbe, forgetActiveRecording, parseProbePayload, rememberActiveRecording } from "../src/probe/offscreen";

describe("probe iframe postMessage RPC", () => {
	const cleanups: Array<() => void> = [];

	afterEach(() => {
		for (const cleanup of cleanups.splice(0)) cleanup();
		delete (globalThis as Record<string, unknown>).__runtime_probe__;
	});

	it("answers tick/state/advance/input/pick/read_entity/patch_entity", async () => {
		let tick = 0;
		const tunables: Record<string, unknown> = { speed: 1 };
		const loop = {
			tick: 0,
			advance(steps: number) {
				tick += steps;
				loop.tick = tick;
				return tick;
			},
			pause: () => true,
			resume: () => true,
		};
		installProbe({
			loop: loop as never,
			state: () => ({ tick, entities: [{ id: "player" }] }),
			input: () => true,
			pick: (x, y) => ({ entity: "player", world: [x, y], source: "player.ts::body" }),
			entity: (id) => (id === "player" ? tunables : null),
			bounds: (id) => (id === "player" ? { speed: { path: "player.speed", min: 0, max: 10, label: "speed" } } : null),
			patch: (id, parameter, value) => {
				if (id !== "player" || !(parameter in tunables)) return false;
				tunables[parameter] = value;
				return true;
			},
		});
		cleanups.push(installProbeBridge(window));

		expect(await postProbe(window, "state")).toEqual({ tick: 0, entities: [{ id: "player" }] });
		expect(await postProbe(window, "advance", [4])).toBe(4);
		expect(await postProbe(window, "tick")).toBe(4);
		expect(await postProbe(window, "input", [{ kind: "key", key: "ArrowRight", action: "press" }])).toBe(true);
		expect(await postProbe(window, "pick", [10, 20])).toEqual({
			entity: "player",
			world: [10, 20],
			source: "player.ts::body",
		});
		expect(await postProbe(window, "read_entity", ["player"])).toEqual({ speed: 1 });
		expect(await postProbe(window, "patch_entity", ["player", "speed", 3])).toBe(true);
		expect(await postProbe(window, "read_entity", ["player"])).toEqual({ speed: 3 });
		expect(await postProbe(window, "read_entity", ["missing"])).toBeNull();
	});

	it("parses offscreen probe payloads including JSON strings", () => {
		expect(parseProbePayload({ ok: true, result: { tick: 1 } })).toEqual({ ok: true, result: { tick: 1 } });
		expect(parseProbePayload(JSON.stringify({ ok: false, error: "runtime probe is not installed" }))).toEqual({
			ok: false,
			error: "runtime probe is not installed",
		});
	});

	it("uses recording.probe for an active recording and otherwise falls back to capture.offscreen", async () => {
		const probe = vi.fn(async () => ({ ok: true, result: 4 }));
		const offscreen = vi.fn(async () => ({ dataUrl: "data:image/png;base64,AAA", scaleFactor: 1, probe: { ok: true, result: { tick: 0 } } }));
		rememberActiveRecording("http://127.0.0.1:5173/", "rec-1");
		const recorded = await callProbe(
			{ recording: { probe }, capture: { offscreen } } as never,
			"http://127.0.0.1:5173/",
			"tick",
		);
		expect(recorded).toEqual({ ok: true, result: 4, error: undefined, via: "recording", recordingId: "rec-1" });
		expect(probe).toHaveBeenCalledWith("rec-1", "tick", null);
		expect(offscreen).not.toHaveBeenCalled();
		forgetActiveRecording("http://127.0.0.1:5173/", "rec-1");
		const fallback = await callProbe(
			{ recording: { probe }, capture: { offscreen } } as never,
			"http://127.0.0.1:5173/",
			"state",
		);
		expect(fallback.via).toBe("capture.offscreen");
		expect(fallback.result).toEqual({ tick: 0 });
		expect(offscreen).toHaveBeenCalled();
	});
});
