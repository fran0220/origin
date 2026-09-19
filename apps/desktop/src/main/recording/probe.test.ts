import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildProbeTelemetryLine,
	executeAndPersistProbe,
	normalizeProbeEnvelope,
	RECORDING_PROBE_SCRIPT,
} from "./probe.js";

interface FakeWindow {
	__runtime_probe__?: unknown;
	__originRecordingProbe?: { call(kind: string, payload: unknown): Promise<unknown> };
	addEventListener(type: string, listener: (event: { data: unknown }) => void): void;
	postMessage(data: unknown, targetOrigin?: string): void;
}

function probeScriptContext(window: FakeWindow) {
	return createContext({ window, setTimeout, clearTimeout, queueMicrotask });
}

function installRecordingProbe(window: FakeWindow): void {
	const listeners: Array<(event: { data: unknown }) => void> = [];
	window.addEventListener = (_type, listener) => {
		listeners.push(listener);
	};
	window.postMessage = (data) => {
		queueMicrotask(() => {
			for (const listener of listeners) listener({ data });
		});
	};
	runInContext(RECORDING_PROBE_SCRIPT, probeScriptContext(window));
}

describe("recording probe persistence", () => {
	it("wraps a successful Game Studio input boolean as telemetry, not just an input.jsonl request", () => {
		expect(buildProbeTelemetryLine("input", 16, { ok: true, result: true }, { kind: "key", key: "Space" })).toEqual({
			atMs: 16,
			kind: "input",
			payload: { ok: true, result: true, request: { kind: "key", key: "Space" } },
		});
	});

	it("persists tick and advance numeric results so afterTick can exceed beforeTick", () => {
		expect(buildProbeTelemetryLine("tick", 0, 10, null)).toEqual({
			atMs: 0,
			kind: "tick",
			payload: { ok: true, result: 10, request: null },
		});
		expect(buildProbeTelemetryLine("advance", 32, { ok: true, result: 12 }, 2)).toEqual({
			atMs: 32,
			kind: "advance",
			payload: { ok: true, result: 12, request: 2 },
		});
	});

	it("records probe failures without inventing a successful result", () => {
		expect(buildProbeTelemetryLine("input", 8, { ok: false, error: "probe timeout" }, { kind: "key" })).toEqual({
			atMs: 8,
			kind: "input",
			payload: { ok: false, error: "probe timeout", request: { kind: "key" } },
		});
		expect(normalizeProbeEnvelope({ ok: false, error: "probe missing" })).toEqual({
			ok: false,
			error: "probe missing",
		});
	});
});

describe("RECORDING_PROBE_SCRIPT execution", () => {
	it("drives __runtime_probe__ through tick → input → advance", async () => {
		let tick = 10;
		const window: FakeWindow = {
			__runtime_probe__: {
				tick: () => tick,
				advance: (steps: number) => {
					tick += steps;
					return tick;
				},
				input: (event: unknown) => event !== null,
			},
			addEventListener() {},
			postMessage() {},
		};
		installRecordingProbe(window);
		const probe = window.__originRecordingProbe;
		expect(probe).toBeDefined();
		await expect(probe!.call("tick", null)).resolves.toEqual({ ok: true, result: 10 });
		await expect(probe!.call("input", { kind: "key", key: "Space" })).resolves.toEqual({ ok: true, result: true });
		await expect(probe!.call("advance", 2)).resolves.toEqual({ ok: true, result: 12 });
	});

	it("falls back to origin-game-probe postMessage when __runtime_probe__ is absent", async () => {
		const window: FakeWindow = {
			addEventListener() {},
			postMessage() {},
		};
		const listeners: Array<(event: { data: unknown }) => void> = [];
		window.addEventListener = (_type, listener) => {
			listeners.push(listener);
		};
		window.postMessage = (data) => {
			const record = data as { type?: string; id?: string; method?: string; args?: unknown[] };
			if (record.type === "origin-game-probe") {
				queueMicrotask(() => {
					for (const listener of listeners) {
						listener({
							data: {
								type: "origin-game-probe-result",
								channel: "origin-game-studio",
								id: record.id,
								ok: true,
								result: record.method === "tick" ? 4 : record.method === "advance" ? 7 : true,
							},
						});
					}
				});
				return;
			}
			queueMicrotask(() => {
				for (const listener of listeners) listener({ data });
			});
		};
		runInContext(RECORDING_PROBE_SCRIPT, probeScriptContext(window));
		const probe = window.__originRecordingProbe;
		expect(probe).toBeDefined();
		await expect(probe!.call("tick", null)).resolves.toEqual({ ok: true, result: 4 });
		await expect(probe!.call("input", { kind: "key" })).resolves.toEqual({ ok: true, result: true });
		await expect(probe!.call("advance", 3)).resolves.toEqual({ ok: true, result: 7 });
	});

	it("returns ok:false when the runtime probe throws instead of rejecting the host call", async () => {
		const window: FakeWindow = {
			__runtime_probe__: {
				input: () => {
					throw new Error("input system missing");
				},
			},
			addEventListener() {},
			postMessage() {},
		};
		installRecordingProbe(window);
		await expect(window.__originRecordingProbe!.call("input", { kind: "key" })).resolves.toEqual({
			ok: false,
			error: "input system missing",
		});
	});
});

describe("executeAndPersistProbe", () => {
	const directories: string[] = [];

	afterEach(async () => {
		for (const directory of directories.splice(0)) {
			await rm(directory, { recursive: true, force: true });
		}
	});

	async function captureFiles(): Promise<{ telemetryPath: string; inputPath: string; originMs: number }> {
		const directory = await mkdtemp(join(tmpdir(), "recording-probe-"));
		directories.push(directory);
		const telemetryPath = join(directory, "telemetry.jsonl");
		const inputPath = join(directory, "input.jsonl");
		await writeFile(telemetryPath, "");
		await writeFile(inputPath, "");
		return { telemetryPath, inputPath, originMs: 1_000 };
	}

	it("writes a greybox tick/input/advance sequence through the real probe method boundary", async () => {
		const files = await captureFiles();
		let tick = 10;
		const window: FakeWindow = {
			__runtime_probe__: {
				tick: () => tick,
				advance: (steps: number) => {
					tick += Number(steps);
					return tick;
				},
				input: () => true,
			},
			addEventListener() {},
			postMessage() {},
		};
		installRecordingProbe(window);
		const page = {
			executeJavaScript: async (code: string) => runInContext(code, probeScriptContext(window)),
		};
		await executeAndPersistProbe(page, { ...files, nowMs: 1_000 }, "tick", null);
		await executeAndPersistProbe(page, { ...files, nowMs: 1_016 }, "input", { kind: "key", key: "Space" });
		await executeAndPersistProbe(page, { ...files, nowMs: 1_032 }, "advance", 2);
		const telemetry = await readFile(files.telemetryPath, "utf8");
		expect(telemetry).toContain('"kind":"tick"');
		expect(telemetry).toContain('"kind":"input"');
		expect(telemetry).toContain('"kind":"advance"');
		expect(telemetry).toContain('"result":true');
		expect(telemetry).toContain('"result":12');
		const input = await readFile(files.inputPath, "utf8");
		expect(input).toContain('"kind":"probe"');
	});

	it("still appends {ok:false,error,request} when executeJavaScript rejects", async () => {
		const files = await captureFiles();
		const page = {
			executeJavaScript: async () => {
				throw new Error("Script failed to execute");
			},
		};
		const returned = await executeAndPersistProbe(page, { ...files, nowMs: 1_008 }, "input", {
			kind: "key",
			key: "Space",
		});
		expect(returned).toEqual({ ok: false, error: "Script failed to execute" });
		const telemetry = await readFile(files.telemetryPath, "utf8");
		expect(JSON.parse(telemetry.trim())).toEqual({
			atMs: 8,
			kind: "input",
			payload: {
				ok: false,
				error: "Script failed to execute",
				request: { kind: "key", key: "Space" },
			},
		});
	});
});
