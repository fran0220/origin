import type { PluginCaptureApi, PluginContext, PluginRecordingApi } from "@origin-org/plugin-sdk";
import type { ProbeMethod } from "./protocol";
import { prepareScriptForReady, probeScriptFor } from "./protocol";

export interface ProbeCallResult {
	ok: boolean;
	result?: unknown;
	error?: string;
	dataUrl?: string;
	via: "capture.offscreen" | "recording";
	recordingId?: string;
}

const ACTIVE_RECORDING_BY_URL = new Map<string, string>();

export function rememberActiveRecording(url: string, recordingId: string): void {
	ACTIVE_RECORDING_BY_URL.set(url, recordingId);
}

export function forgetActiveRecording(url: string, recordingId?: string): void {
	const current = ACTIVE_RECORDING_BY_URL.get(url);
	if (recordingId && current !== recordingId) return;
	ACTIVE_RECORDING_BY_URL.delete(url);
}

export function activeRecordingIdFor(url: string): string | undefined {
	return ACTIVE_RECORDING_BY_URL.get(url);
}

function probePayload(method: ProbeMethod, args: readonly unknown[]): unknown {
	if (method === "advance") return args[0] ?? 1;
	if (method === "input") return args[0];
	if (method === "pick") return { x: args[0], y: args[1] };
	if (method === "read_entity") return args[0];
	if (method === "patch_entity") return { id: args[0], parameter: args[1], value: args[2] };
	return args[0] ?? null;
}

function recordingProbeKind(
	method: ProbeMethod,
): "tick" | "state" | "advance" | "input" | "pick" | "read_entity" | "patch_entity" | null {
	if (
		method === "tick" ||
		method === "state" ||
		method === "advance" ||
		method === "input" ||
		method === "pick" ||
		method === "read_entity" ||
		method === "patch_entity"
	) {
		return method;
	}
	return null;
}

async function callRecordingProbe(
	recording: PluginRecordingApi,
	recordingId: string,
	method: ProbeMethod,
	args: readonly unknown[],
): Promise<ProbeCallResult> {
	const kind = recordingProbeKind(method);
	if (!kind) {
		return { ok: false, via: "recording", recordingId, error: `recording probe does not support ${method}` };
	}
	const raw = await recording.probe(recordingId, kind, probePayload(method, args));
	const probe = parseProbePayload(raw);
	return {
		ok: probe.ok,
		result: probe.result,
		error: probe.error,
		via: "recording",
		recordingId,
	};
}

export async function callProbe(
	ctx: PluginContext,
	url: string,
	method: ProbeMethod,
	args: readonly unknown[] = [],
): Promise<ProbeCallResult> {
	const recording = ctx.recording;
	const recordingId = activeRecordingIdFor(url);
	if (recording && recordingId) {
		return callRecordingProbe(recording, recordingId, method, args);
	}

	const capture: PluginCaptureApi | undefined = ctx.capture;
	if (!capture) {
		if (recording) {
			return {
				ok: false,
				via: "recording",
				error: "no active recording; start a recording or use capture.offscreen",
			};
		}
		return { ok: false, via: "capture.offscreen", error: "capture.offscreen is unavailable on this host" };
	}
	const result = await capture.offscreen({
		url,
		width: 1280,
		height: 720,
		sessionKey: `origin-game-studio:${url}`,
		prepareScript: prepareScriptForReady(),
		readyExpression: "Boolean(globalThis.__runtime_probe__)",
		settleMs: 50,
		probeScript: probeScriptFor(method, args),
		timeoutMs: 20_000,
		format: "png",
	});
	const probe = parseProbePayload(result.probe);
	return {
		ok: probe.ok,
		result: probe.result,
		error: probe.error,
		dataUrl: result.dataUrl,
		via: "capture.offscreen",
	};
}

export function parseProbePayload(payload: unknown): { ok: boolean; result?: unknown; error?: string } {
	if (typeof payload === "string") {
		try {
			return parseProbePayload(JSON.parse(payload));
		} catch {
			return { ok: false, error: "probe payload was not JSON" };
		}
	}
	if (typeof payload !== "object" || payload === null) {
		return { ok: false, error: "probe returned no payload" };
	}
	const record = payload as Record<string, unknown>;
	if (record.ok === true) return { ok: true, result: record.result };
	if (record.ok === false) return { ok: false, error: String(record.error ?? "probe refused") };
	return { ok: true, result: payload };
}
