import { appendFile } from "node:fs/promises";
import type { RecordingInputLine, RecordingTelemetryLine } from "@vetta/runtime-recording";
import { serializeRecordingJsonlLine } from "@vetta/runtime-recording";

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

export const RECORDING_PROBE_SCRIPT = `
(() => {
  if (window.__vettaRecordingProbe) return true;
  const pending = new Map();
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== "vetta-recording-page") return;
    const waiter = pending.get(data.id);
    if (!waiter) return;
    pending.delete(data.id);
    waiter(data);
  });
  let nextId = 1;
  window.__vettaRecordingProbe = {
    call(kind, payload) {
      const id = nextId++;
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve({ ok: false, error: "probe timeout" });
        }, 2000);
        pending.set(id, (data) => {
          clearTimeout(timer);
          resolve(data);
        });
        window.postMessage({ source: "vetta-recording-host", id, kind, payload }, "*");
      });
    }
  };
  return true;
})();
`;

export async function appendJsonl(path: string, line: RecordingTelemetryLine | RecordingInputLine): Promise<void> {
	await appendFile(path, `${serializeRecordingJsonlLine(line)}\n`, "utf8");
}
