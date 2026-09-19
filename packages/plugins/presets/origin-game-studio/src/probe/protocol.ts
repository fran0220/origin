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
	type: typeof PROBE_MESSAGE_TYPE;
	channel: typeof PROBE_CHANNEL;
	id: string;
	method: ProbeMethod;
	args?: readonly unknown[];
}

export interface ProbeSuccess {
	type: typeof PROBE_RESULT_TYPE;
	channel: typeof PROBE_CHANNEL;
	id: string;
	ok: true;
	result: unknown;
}

export interface ProbeFailure {
	type: typeof PROBE_RESULT_TYPE;
	channel: typeof PROBE_CHANNEL;
	id: string;
	ok: false;
	error: string;
}

export type ProbeResponse = ProbeSuccess | ProbeFailure;

export function createProbeRequest(id: string, method: ProbeMethod, args: readonly unknown[] = []): ProbeRequest {
	return { type: PROBE_MESSAGE_TYPE, channel: PROBE_CHANNEL, id, method, args };
}

export function isProbeResponse(value: unknown, id?: string): value is ProbeResponse {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	if (record.type !== PROBE_RESULT_TYPE || record.channel !== PROBE_CHANNEL) return false;
	if (typeof record.id !== "string") return false;
	if (id !== undefined && record.id !== id) return false;
	return record.ok === true || record.ok === false;
}

export function probeScriptFor(method: ProbeMethod, args: readonly unknown[] = []): string {
	const request = createProbeRequest("offscreen", method, args);
	return `(function(){
  const probe = globalThis.__runtime_probe__;
  if (!probe) return JSON.stringify({ ok: false, error: "runtime probe is not installed" });
  const request = ${JSON.stringify(request)};
  try {
    let result;
    switch (request.method) {
      case "tick": result = probe.tick(); break;
      case "state": result = probe.state(); break;
      case "advance": result = probe.advance(Number((request.args||[])[0] ?? 1)); break;
      case "pause": result = probe.pause(); break;
      case "resume": result = probe.resume(); break;
      case "input": result = probe.input((request.args||[])[0]); break;
      case "pick": result = probe.pick(Number((request.args||[])[0]), Number((request.args||[])[1])); break;
      case "read_entity": result = probe.entity(String((request.args||[])[0] ?? "")); break;
      case "bounds": result = probe.bounds(String((request.args||[])[0] ?? "")); break;
      case "patch_entity": result = probe.patch(String((request.args||[])[0] ?? ""), String((request.args||[])[1] ?? ""), (request.args||[])[2]); break;
      default: return JSON.stringify({ ok: false, error: "unknown probe method" });
    }
    return JSON.stringify({ ok: true, result });
  } catch (error) {
    return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
})()`;
}

export function prepareScriptForReady(): string {
	return `(function(){
  window.__origin_game_ready = Boolean(globalThis.__runtime_probe__);
  return window.__origin_game_ready;
})()`;
}

export async function postProbe(
	target: Window,
	method: ProbeMethod,
	args: readonly unknown[] = [],
	timeoutMs = 2_000,
): Promise<unknown> {
	const id = `probe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const request = createProbeRequest(id, method, args);
	return await new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			window.removeEventListener("message", onMessage);
			reject(new Error(`probe ${method} timed out`));
		}, timeoutMs);
		const onMessage = (event: MessageEvent<unknown>) => {
			if (!isProbeResponse(event.data, id)) return;
			clearTimeout(timer);
			window.removeEventListener("message", onMessage);
			if (event.data.ok) resolve(event.data.result);
			else reject(new Error(event.data.error));
		};
		window.addEventListener("message", onMessage);
		target.postMessage(request, "*");
	});
}
