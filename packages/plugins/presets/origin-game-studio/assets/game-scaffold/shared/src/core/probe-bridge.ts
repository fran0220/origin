/**
 * Page-side iframe / postMessage RPC around `__runtime_probe__`.
 *
 * The Origin Game Studio stage talks to a running game through this channel:
 * the host (or an embedding iframe parent) posts `{ type, id, method, args }`
 * and the page answers with `{ type, id, ok, result | error }`. The same
 * messages work when the game itself is the top-level document — there is no
 * second protocol for that case.
 */

import { PROBE_GLOBAL, type RuntimeProbe } from "./probe.js";

export const PROBE_MESSAGE_TYPE = "origin-game-probe";
export const PROBE_RESULT_TYPE = "origin-game-probe-result";
export const PROBE_CHANNEL = "origin-game-studio";

export type ProbeMethod =
	| "tick"
	| "state"
	| "advance"
	| "pause"
	| "resume"
	| "input"
	| "pick"
	| "read_entity"
	| "patch_entity"
	| "bounds";

export interface ProbeRequest {
	readonly type: typeof PROBE_MESSAGE_TYPE;
	readonly channel: typeof PROBE_CHANNEL;
	readonly id: string;
	readonly method: ProbeMethod;
	readonly args?: readonly unknown[];
}

export interface ProbeSuccess {
	readonly type: typeof PROBE_RESULT_TYPE;
	readonly channel: typeof PROBE_CHANNEL;
	readonly id: string;
	readonly ok: true;
	readonly result: unknown;
}

export interface ProbeFailure {
	readonly type: typeof PROBE_RESULT_TYPE;
	readonly channel: typeof PROBE_CHANNEL;
	readonly id: string;
	readonly ok: false;
	readonly error: string;
}

export type ProbeResponse = ProbeSuccess | ProbeFailure;

export function isProbeRequest(value: unknown): value is ProbeRequest {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		record.type === PROBE_MESSAGE_TYPE &&
		record.channel === PROBE_CHANNEL &&
		typeof record.id === "string" &&
		typeof record.method === "string"
	);
}

function probeFromGlobal(): RuntimeProbe | null {
	const candidate = (globalThis as Record<string, unknown>)[PROBE_GLOBAL];
	if (typeof candidate !== "object" || candidate === null) return null;
	return candidate as RuntimeProbe;
}

function dispatch(probe: RuntimeProbe, method: ProbeMethod, args: readonly unknown[]): unknown {
	switch (method) {
		case "tick":
			return probe.tick();
		case "state":
			return probe.state();
		case "advance":
			return probe.advance(Number(args[0] ?? 1));
		case "pause":
			return probe.pause();
		case "resume":
			return probe.resume();
		case "input":
			return probe.input(args[0] as never);
		case "pick":
			return probe.pick(Number(args[0]), Number(args[1]));
		case "read_entity":
			return probe.entity(String(args[0] ?? ""));
		case "bounds":
			return probe.bounds(String(args[0] ?? ""));
		case "patch_entity":
			return probe.patch(String(args[0] ?? ""), String(args[1] ?? ""), args[2]);
	}
}

export function installProbeBridge(target: Window = window): () => void {
	const onMessage = (event: MessageEvent<unknown>): void => {
		if (!isProbeRequest(event.data)) return;
		const request = event.data;
		const probe = probeFromGlobal();
		const source = event.source;
		const reply = (response: ProbeResponse): void => {
			const targetWindow =
				source && "postMessage" in source ? (source as Window) : target;
			targetWindow.postMessage(response, event.origin === "null" || event.origin === "" ? "*" : event.origin);
		};
		if (probe === null) {
			reply({
				type: PROBE_RESULT_TYPE,
				channel: PROBE_CHANNEL,
				id: request.id,
				ok: false,
				error: "runtime probe is not installed",
			});
			return;
		}
		try {
			const result = dispatch(probe, request.method, request.args ?? []);
			reply({
				type: PROBE_RESULT_TYPE,
				channel: PROBE_CHANNEL,
				id: request.id,
				ok: true,
				result,
			});
		} catch (error) {
			reply({
				type: PROBE_RESULT_TYPE,
				channel: PROBE_CHANNEL,
				id: request.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	};
	target.addEventListener("message", onMessage);
	return () => target.removeEventListener("message", onMessage);
}
