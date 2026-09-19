import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import type {
	AssertionVerifierRef,
	CommandVerifierRef,
	EvaluationEvidence,
	VerifierRef,
	VerifierRunContext,
	VerifierRunner,
	VerifierRunResult,
} from "@origin/runtime-evaluation";
import { EvaluationError } from "@origin/runtime-evaluation";
import { sha256Json, sha256Text } from "./digest.js";
import { evaluateTelemetryAssertion, parseTelemetryAssertionExpression } from "./telemetry-assertion.js";

export { evaluateTelemetryAssertion } from "./telemetry-assertion.js";

export interface CommandVerifierExecutor {
	run(
		command: string,
		args: readonly string[],
		cwd: string,
		options: { readonly signal?: AbortSignal; readonly timeoutMs?: number },
	): Promise<{
		readonly code: number;
		readonly stdout: string;
		readonly stderr: string;
		readonly startedAt: string;
		readonly endedAt: string;
		readonly killed: boolean;
	}>;
}

export function createNodeCommandVerifierExecutor(): CommandVerifierExecutor {
	return {
		run(command, args, cwd, options) {
			return new Promise((resolve, reject) => {
				const startedAt = new Date().toISOString();
				const child = spawn(command, [...args], {
					cwd,
					shell: false,
					stdio: ["ignore", "pipe", "pipe"],
					windowsHide: true,
				});
				let stdout = "";
				let stderr = "";
				let killed = false;
				let settled = false;
				let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
				const stop = (): void => {
					if (killed) return;
					killed = true;
					child.kill("SIGTERM");
					setTimeout(() => {
						if (!child.killed) child.kill("SIGKILL");
					}, 5_000);
				};
				const finish = (code: number): void => {
					if (settled) return;
					settled = true;
					if (timeoutHandle) clearTimeout(timeoutHandle);
					options.signal?.removeEventListener("abort", stop);
					resolve({
						code,
						stdout,
						stderr,
						startedAt,
						endedAt: new Date().toISOString(),
						killed,
					});
				};
				if (options.signal?.aborted) {
					stop();
				} else {
					options.signal?.addEventListener("abort", stop, { once: true });
				}
				if (options.timeoutMs && options.timeoutMs > 0) timeoutHandle = setTimeout(stop, options.timeoutMs);
				child.stdout?.on("data", (data: Buffer) => {
					stdout += data.toString();
				});
				child.stderr?.on("data", (data: Buffer) => {
					stderr += data.toString();
				});
				child.once("close", (code) => finish(code ?? 0));
				child.once("error", (error) => {
					if (settled) return;
					settled = true;
					reject(error);
				});
			});
		},
	};
}

export interface NodeVerifierRunnerOptions {
	readonly executor?: CommandVerifierExecutor;
	readonly defaultCwd?: string;
	readonly createId?: () => string;
}

export function createNodeVerifierRunner(options: NodeVerifierRunnerOptions = {}): VerifierRunner {
	const executor = options.executor ?? createNodeCommandVerifierExecutor();
	const createId = options.createId ?? (() => globalThis.crypto.randomUUID());
	return {
		async run(verifier: VerifierRef, criterionId: string, context: VerifierRunContext): Promise<VerifierRunResult> {
			if (verifier.kind === "command") {
				return runCommandVerifier(verifier, criterionId, context, executor, options.defaultCwd, createId);
			}
			return runAssertionVerifier(verifier, criterionId, context);
		},
	};
}

async function runCommandVerifier(
	verifier: CommandVerifierRef,
	criterionId: string,
	context: VerifierRunContext,
	executor: CommandVerifierExecutor,
	defaultCwd: string | undefined,
	createId: () => string,
): Promise<VerifierRunResult> {
	const cwd = verifier.cwd ?? defaultCwd;
	if (!cwd) {
		throw new EvaluationError("unavailable", "command verifier requires a working directory");
	}
	const startedId = `receipt:${createId()}`;
	try {
		const result = await executor.run(verifier.command, verifier.args ?? [], cwd, {
			signal: context.signal,
			timeoutMs: verifier.timeoutMs,
		});
		if (context.signal?.aborted || result.killed) {
			throw new EvaluationError("cancelled", "The evaluation was cancelled.");
		}
		const receipt = {
			executionId: startedId.slice("receipt:".length),
			command: [verifier.command, ...(verifier.args ?? [])].join(" "),
			cwd,
			startedAt: result.startedAt,
			endedAt: result.endedAt,
			outcome: { kind: "exited", code: result.code },
		};
		const evidence: EvaluationEvidence = {
			id: startedId,
			source: { kind: "execution-receipt", executionId: receipt.executionId },
			capturedAt: result.endedAt,
			digest: sha256Json(receipt),
			summary: `${receipt.command} exited ${result.code}`,
		};
		return {
			assessment: {
				criterionId,
				state: result.code === 0 ? "passed" : "failed",
				evidenceIds: [evidence.id],
				note: result.code === 0 ? undefined : result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`,
			},
			evidence: [evidence],
		};
	} catch (error) {
		if (error instanceof EvaluationError) throw error;
		throw new EvaluationError("unavailable", error instanceof Error ? error.message : String(error));
	}
}

async function runAssertionVerifier(
	verifier: AssertionVerifierRef,
	criterionId: string,
	context: VerifierRunContext,
): Promise<VerifierRunResult> {
	const parsed = parseTelemetryAssertionExpression(verifier.expression);
	if ("error" in parsed) {
		return {
			assessment: {
				criterionId,
				state: "error",
				evidenceIds: [],
				note: parsed.error,
			},
			evidence: [],
		};
	}
	const selected = selectRecordingEvidence(context);
	if (selected.kind !== "ok") {
		return {
			assessment: {
				criterionId,
				state: "inconclusive",
				evidenceIds: selected.evidenceIds,
				note: selected.note,
			},
			evidence: [],
		};
	}
	const recording = selected.recording;
	const telemetryPath = recording.source.kind === "recording" ? recording.source.telemetryPath : undefined;
	if (!telemetryPath) {
		return {
			assessment: {
				criterionId,
				state: "inconclusive",
				evidenceIds: [recording.id],
				note: "No recording telemetry is available for this assertion.",
			},
			evidence: [],
		};
	}
	try {
		const text = await readFile(telemetryPath, "utf8");
		const digest = sha256Text(text);
		if (recording.digest !== digest) {
			return {
				assessment: {
					criterionId,
					state: "error",
					evidenceIds: [recording.id],
					note: "Recording telemetry digest does not match the snapshot that was captured.",
				},
				evidence: [],
			};
		}
		const result = evaluateTelemetryAssertion(text, verifier.expression);
		return {
			assessment: {
				criterionId,
				state: result.state,
				evidenceIds: [recording.id],
				...(result.note ? { note: result.note } : {}),
			},
			evidence: [],
		};
	} catch (error) {
		return {
			assessment: {
				criterionId,
				state: "error",
				evidenceIds: [recording.id],
				note: error instanceof Error ? error.message : String(error),
			},
			evidence: [],
		};
	}
}

function selectRecordingEvidence(
	context: VerifierRunContext,
):
	| { readonly kind: "ok"; readonly recording: EvaluationEvidence }
	| { readonly kind: "inconclusive"; readonly evidenceIds: readonly string[]; readonly note: string } {
	const candidates = context.evidence.filter(
		(item) => item.source.kind === "recording" && Boolean(item.source.telemetryPath),
	);
	const requestedId = context.trigger.kind === "manual" ? context.trigger.ref?.trim() : undefined;
	const exact =
		requestedId === undefined || requestedId.length === 0
			? undefined
			: candidates.find((item) => item.source.kind === "recording" && item.source.recordingId === requestedId);
	if (exact) return { kind: "ok", recording: exact };
	if (candidates.length === 1) return { kind: "ok", recording: candidates[0]! };
	if (candidates.length === 0) {
		return {
			kind: "inconclusive",
			evidenceIds: [],
			note: "No recording telemetry is available for this assertion.",
		};
	}
	return {
		kind: "inconclusive",
		evidenceIds: candidates.map((item) => item.id),
		note: "Multiple recording telemetry snapshots are in scope; the assertion needs an exact recording id.",
	};
}
