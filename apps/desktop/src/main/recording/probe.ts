import { appendFile } from "node:fs/promises";
import type { RecordingInputLine, RecordingTelemetryLine } from "@origin/runtime-recording";
import { serializeRecordingJsonlLine } from "@origin/runtime-recording";

export const RECORDING_PROBE_KINDS = [
	"tick",
	"state",
	"advance",
	"input",
	"pick",
	"read_entity",
	"patch_entity",
] as const;

export type RecordingProbeKind = (typeof RECORDING_PROBE_KINDS)[number];

export type ProbeEnvelope =
	| { readonly ok: true; readonly result: unknown }
	| { readonly ok: false; readonly error: string };

/**
 * Injected into the capture page. Prefers `__runtime_probe__` (Game Studio),
 * then the page's origin-game-probe bridge, then a host/page postMessage pair.
 */
export const RECORDING_PROBE_SCRIPT = `
(() => {
  if (window.__originRecordingProbe) return true;
  const pending = new Map();
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.source === "vetta-recording-page") {
      const waiter = pending.get(data.id);
      if (!waiter) return;
      pending.delete(data.id);
      waiter(data);
      return;
    }
    if (data.type === "origin-game-probe-result" && data.channel === "origin-game-studio") {
      const waiter = pending.get(data.id);
      if (!waiter) return;
      pending.delete(data.id);
      waiter(data);
    }
  });
  let nextId = 1;
  function hasRuntimeProbe() {
    const probe = window.__runtime_probe__;
    return typeof probe === "object" && probe !== null;
  }
  function dispatchRuntimeProbe(kind, payload) {
    const probe = window.__runtime_probe__;
    switch (kind) {
      case "tick":
        return probe.tick();
      case "state":
        return probe.state();
      case "advance": {
        const steps = typeof payload === "number" ? payload : payload && typeof payload.steps === "number" ? payload.steps : 1;
        return probe.advance(steps);
      }
      case "input":
        return probe.input(payload);
      case "pick": {
        const x = Array.isArray(payload) ? payload[0] : payload && payload.x;
        const y = Array.isArray(payload) ? payload[1] : payload && payload.y;
        return probe.pick(Number(x), Number(y));
      }
      case "read_entity": {
        const id = typeof payload === "string" ? payload : payload && payload.id != null ? payload.id : "";
        return probe.entity(String(id));
      }
      case "patch_entity": {
        const id = Array.isArray(payload) ? payload[0] : payload && payload.id;
        const parameter = Array.isArray(payload) ? payload[1] : payload && payload.parameter;
        const value = Array.isArray(payload) ? payload[2] : payload && payload.value;
        return probe.patch(String(id == null ? "" : id), String(parameter == null ? "" : parameter), value);
      }
      default:
        throw new Error("unknown probe kind: " + kind);
    }
  }
  function argsForBridge(kind, payload) {
    switch (kind) {
      case "tick":
      case "state":
        return [];
      case "advance":
        return [typeof payload === "number" ? payload : payload && typeof payload.steps === "number" ? payload.steps : 1];
      case "input":
        return [payload];
      case "pick":
        return [Array.isArray(payload) ? payload[0] : payload && payload.x, Array.isArray(payload) ? payload[1] : payload && payload.y];
      case "read_entity":
        return [typeof payload === "string" ? payload : payload && payload.id];
      case "patch_entity":
        return Array.isArray(payload) ? payload : [payload && payload.id, payload && payload.parameter, payload && payload.value];
      default:
        return payload == null ? [] : [payload];
    }
  }
  function postAndWait(message) {
    const id = message.id;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, error: "probe timeout" });
      }, 2000);
      pending.set(id, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
      window.postMessage(message, "*");
    });
  }
  window.__originRecordingProbe = {
    async call(kind, payload) {
      try {
        if (hasRuntimeProbe()) {
          return { ok: true, result: dispatchRuntimeProbe(kind, payload) };
        }
        const bridgeId = String(nextId++);
        const bridge = await postAndWait({
          type: "origin-game-probe",
          channel: "origin-game-studio",
          id: bridgeId,
          method: kind,
          args: argsForBridge(kind, payload),
        });
        if (bridge && bridge.type === "origin-game-probe-result") {
          return bridge.ok === true
            ? { ok: true, result: bridge.result }
            : { ok: false, error: String(bridge.error || "probe refused") };
        }
        const legacyId = nextId++;
        const legacy = await postAndWait({
          source: "vetta-recording-host",
          id: legacyId,
          kind,
          payload,
        });
        if (legacy && legacy.source === "vetta-recording-page") {
          if (legacy.ok === false) return { ok: false, error: String(legacy.error || "probe refused") };
          return { ok: true, result: "result" in legacy ? legacy.result : legacy };
        }
        return { ok: false, error: "probe timeout" };
      } catch (error) {
        return { ok: false, error: error && error.message ? String(error.message) : String(error) };
      }
    }
  };
  return true;
})();
`;

export function normalizeProbeEnvelope(raw: unknown): ProbeEnvelope {
	if (typeof raw !== "object" || raw === null) {
		return { ok: true, result: raw };
	}
	const record = raw as Record<string, unknown>;
	if (record.ok === false) {
		return { ok: false, error: String(record.error ?? "probe refused") };
	}
	if (record.type === "origin-game-probe-result") {
		if (record.ok === true) return { ok: true, result: record.result };
		return { ok: false, error: String(record.error ?? "probe refused") };
	}
	if (record.ok === true && "result" in record) {
		return { ok: true, result: record.result };
	}
	return { ok: true, result: raw };
}

export function buildProbeTelemetryLine(
	kind: RecordingProbeKind,
	atMs: number,
	raw: unknown,
	request: unknown,
): RecordingTelemetryLine {
	const envelope = normalizeProbeEnvelope(raw);
	return {
		atMs,
		kind,
		payload: envelope.ok
			? { ok: true, result: envelope.result, request: request ?? null }
			: { ok: false, error: envelope.error, request: request ?? null },
	};
}

export async function appendJsonl(path: string, line: RecordingTelemetryLine | RecordingInputLine): Promise<void> {
	await appendFile(path, `${serializeRecordingJsonlLine(line)}\n`, "utf8");
}

export function pageProbeJavaScript(kind: RecordingProbeKind, payload: unknown): string {
	return `window.__originRecordingProbe ? window.__originRecordingProbe.call(${JSON.stringify(kind)}, ${JSON.stringify(payload ?? null)}) : { ok: false, error: "probe missing" }`;
}

export function probeFailureEnvelope(error: unknown): ProbeEnvelope {
	return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export interface ProbePageExecutor {
	executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
}

export interface ProbeCaptureFiles {
	readonly telemetryPath: string;
	readonly inputPath: string;
	readonly originMs: number;
	readonly nowMs?: number;
}

/**
 * Call the injected page probe and always persist a telemetry line, including
 * executeJavaScript rejections which become `{ ok: false, error, request }`.
 */
export async function executeAndPersistProbe(
	page: ProbePageExecutor,
	files: ProbeCaptureFiles,
	kind: RecordingProbeKind,
	payload?: unknown,
): Promise<unknown> {
	const atMs = (files.nowMs ?? Date.now()) - files.originMs;
	let result: unknown;
	try {
		result = await page.executeJavaScript(pageProbeJavaScript(kind, payload), true);
	} catch (error) {
		result = probeFailureEnvelope(error);
	}
	await appendJsonl(files.telemetryPath, buildProbeTelemetryLine(kind, atMs, result, payload ?? null));
	if (kind === "input") {
		await appendJsonl(files.inputPath, { atMs, kind: "probe", payload: payload ?? result });
	}
	return result;
}
