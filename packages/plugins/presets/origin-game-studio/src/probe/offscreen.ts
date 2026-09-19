import type { PluginCaptureApi, PluginContext } from "@vetta-org/plugin-sdk";
import { readHostCapabilities } from "../adapters/host-capabilities";
import type { ProbeMethod } from "./protocol";
import { prepareScriptForReady, probeScriptFor } from "./protocol";

export interface ProbeCallResult {
	ok: boolean;
	result?: unknown;
	error?: string;
	dataUrl?: string;
	via: "capture.offscreen" | "recording";
}

export async function callProbe(
	ctx: PluginContext,
	url: string,
	method: ProbeMethod,
	args: readonly unknown[] = [],
): Promise<ProbeCallResult> {
	const recording = readHostCapabilities(ctx).recording;
	if (recording) {
		return {
			ok: false,
			via: "recording",
			error: "recording probe channel is present but Game Studio still talks through capture.offscreen until the Recording thread publishes its RPC contract",
		};
	}
	const capture: PluginCaptureApi | undefined = ctx.capture;
	if (!capture) {
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
