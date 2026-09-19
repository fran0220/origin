import { describe, expect, it } from "vitest";
import {
	evaluateTelemetryAssertion,
	parseTelemetryAssertionExpression,
	projectRecordingTelemetry,
} from "./telemetry-assertion.js";

const PLAYBACK =
	'{"all":[{"path":"playback.refused","op":"eq","value":0},{"path":"playback.dispatched","op":"gt","value":0}]}';
const TICK = '{"path":"afterTick","op":"gt","other":"beforeTick"}';

const passingJsonl = [
	`{"atMs":0,"kind":"tick","payload":{"ok":true,"result":10,"request":null}}`,
	`{"atMs":16,"kind":"input","payload":{"ok":true,"result":true,"request":{"kind":"key","key":"Space"}}}`,
	`{"atMs":32,"kind":"advance","payload":{"ok":true,"result":12,"request":1}}`,
].join("\n");

describe("telemetry assertion expression", () => {
	it("accepts the Game Studio greybox JSON expressions", () => {
		expect("error" in parseTelemetryAssertionExpression(PLAYBACK)).toBe(false);
		expect("error" in parseTelemetryAssertionExpression(TICK)).toBe(false);
	});

	it("rejects JavaScript, substring DSL, eval-shaped, and unknown keys", () => {
		expect(parseTelemetryAssertionExpression("playback.refused === 0 && playback.dispatched > 0")).toMatchObject({
			error: expect.stringContaining("JSON"),
		});
		expect(parseTelemetryAssertionExpression("contains:refused")).toMatchObject({
			error: expect.stringContaining("JSON"),
		});
		expect(
			parseTelemetryAssertionExpression('{"path":"playback.refused","op":"eq","value":0,"eval":"1"}'),
		).toMatchObject({
			error: expect.stringContaining("unknown keys"),
		});
		expect(parseTelemetryAssertionExpression('{"path":"__proto__.x","op":"eq","value":1}')).toMatchObject({
			error: expect.stringContaining("path"),
		});
	});

	it("limits expression size by UTF-8 bytes, not JS string length", () => {
		const under = `{"path":"afterTick","op":"eq","value":"${"a".repeat(4_000)}"}`;
		expect("error" in parseTelemetryAssertionExpression(under)).toBe(false);
		const overBytes = `{"path":"afterTick","op":"eq","value":"${"中".repeat(2_000)}"}`;
		expect(overBytes.length < 4_096).toBe(true);
		expect(Buffer.byteLength(overBytes, "utf8") > 4_096).toBe(true);
		expect(parseTelemetryAssertionExpression(overBytes)).toMatchObject({
			error: expect.stringContaining("4KB"),
		});
	});
});

describe("recording telemetry projection", () => {
	it("counts only boolean input results and tick numbers from probe envelopes", () => {
		expect(
			projectRecordingTelemetry([
				{ atMs: 0, kind: "tick", payload: { ok: true, result: 4, request: null } },
				{ atMs: 8, kind: "input", payload: { ok: true, result: true, request: { kind: "key" } } },
				{ atMs: 9, kind: "input", payload: { ok: true, result: false, request: { kind: "key" } } },
				{ atMs: 10, kind: "input", payload: { ok: false, error: "timeout", request: null } },
				{ atMs: 16, kind: "advance", payload: { ok: true, result: 7, request: 3 } },
			]),
		).toEqual({
			playback: { dispatched: 1, refused: 1 },
			beforeTick: 4,
			afterTick: 7,
		});
	});

	it("does not invent playback or tick fields when samples are missing", () => {
		expect(projectRecordingTelemetry([{ atMs: 0, kind: "state", payload: { tick: 9 } }])).toEqual({});
		expect(
			projectRecordingTelemetry([{ atMs: 0, kind: "tick", payload: { ok: true, result: 1, request: null } }]),
		).toEqual({});
	});
});

describe("evaluateTelemetryAssertion against JSONL", () => {
	it("passes Game Studio greybox expressions on a real probe sequence", () => {
		expect(evaluateTelemetryAssertion(passingJsonl, PLAYBACK)).toEqual({ state: "passed" });
		expect(evaluateTelemetryAssertion(passingJsonl, TICK)).toEqual({ state: "passed" });
	});

	it("fails when ticks did not advance", () => {
		const stuck = [
			`{"atMs":0,"kind":"tick","payload":{"ok":true,"result":4,"request":null}}`,
			`{"atMs":16,"kind":"advance","payload":{"ok":true,"result":4,"request":1}}`,
		].join("\n");
		expect(evaluateTelemetryAssertion(stuck, TICK)).toMatchObject({ state: "failed" });
	});

	it("fails when accepted input was refused", () => {
		const refused = [
			`{"atMs":0,"kind":"tick","payload":{"ok":true,"result":1,"request":null}}`,
			`{"atMs":8,"kind":"input","payload":{"ok":true,"result":false,"request":{"kind":"key"}}}`,
			`{"atMs":16,"kind":"advance","payload":{"ok":true,"result":2,"request":1}}`,
		].join("\n");
		expect(evaluateTelemetryAssertion(refused, PLAYBACK)).toMatchObject({ state: "failed" });
	});

	it("is inconclusive when playback or tick samples are absent", () => {
		expect(evaluateTelemetryAssertion("", PLAYBACK)).toMatchObject({ state: "inconclusive" });
		expect(
			evaluateTelemetryAssertion(
				`{"atMs":0,"kind":"state","payload":{"ok":true,"result":{"tick":3},"request":null}}\n`,
				TICK,
			),
		).toMatchObject({ state: "inconclusive", note: expect.stringContaining("afterTick") });
		expect(
			evaluateTelemetryAssertion(`{"atMs":0,"kind":"tick","payload":{"ok":true,"result":3,"request":null}}\n`, TICK),
		).toMatchObject({ state: "inconclusive" });
	});

	it("does not pass because the same numbers appear on an unrelated field", () => {
		const decoy = [
			`{"atMs":0,"kind":"state","payload":{"ok":true,"result":{"playback":{"refused":0,"dispatched":4},"afterTick":9,"beforeTick":1},"request":null}}`,
			`{"atMs":8,"kind":"pick","payload":{"ok":true,"result":{"refused":0},"request":null}}`,
		].join("\n");
		expect(evaluateTelemetryAssertion(decoy, PLAYBACK)).toMatchObject({ state: "inconclusive" });
		expect(evaluateTelemetryAssertion(decoy, TICK)).toMatchObject({ state: "inconclusive" });
		expect(evaluateTelemetryAssertion(decoy, "contains:refused")).toMatchObject({ state: "error" });
	});

	it("errors on malformed JSONL rather than treating it as a miss", () => {
		expect(evaluateTelemetryAssertion("{not-json}\n", PLAYBACK)).toMatchObject({ state: "error" });
		expect(evaluateTelemetryAssertion(`{"atMs":0,"kind":"not-a-kind","payload":{}}\n`, PLAYBACK)).toMatchObject({
			state: "error",
		});
	});
});
