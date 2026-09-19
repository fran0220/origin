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
} from "@vetta/runtime-evaluation";
import { EvaluationError } from "@vetta/runtime-evaluation";
import { sha256Json, sha256Text } from "./digest.js";

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
	const recording = context.evidence.find((item) => item.source.kind === "recording");
	if (!recording || recording.source.kind !== "recording" || !recording.source.telemetryPath) {
		return {
			assessment: {
				criterionId,
				state: "inconclusive",
				evidenceIds: recording ? [recording.id] : [],
				note: "No recording telemetry is available for this assertion.",
			},
			evidence: [],
		};
	}
	try {
		const text = await readFile(recording.source.telemetryPath, "utf8");
		const passed = evaluateTelemetryAssertion(text, verifier.expression);
		return {
			assessment: {
				criterionId,
				state: passed ? "passed" : "failed",
				evidenceIds: [recording.id],
				note: passed ? undefined : `assertion failed: ${verifier.expression}`,
			},
			evidence: [
				{
					id: recording.id,
					source: recording.source,
					capturedAt: recording.capturedAt,
					digest: sha256Text(text),
					summary: recording.summary,
				},
			],
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

/**
 * 极小断言：`key == value` / `key != value` / `contains:text`。
 * 完整遥测查询等 Recording 线程落地后再扩展。
 */
export function evaluateTelemetryAssertion(telemetryText: string, expression: string): boolean {
	const trimmed = expression.trim();
	if (trimmed.startsWith("contains:")) return telemetryText.includes(trimmed.slice("contains:".length));
	const equals = trimmed.match(/^([^=!]+)\s*==\s*(.+)$/);
	if (equals)
		return (
			telemetryText.includes(`"${equals[1]!.trim()}":${jsonish(equals[2]!.trim())}`) ||
			telemetryText.includes(equals[2]!.trim())
		);
	const notEquals = trimmed.match(/^([^=!]+)\s*!=\s*(.+)$/);
	if (notEquals) return !telemetryText.includes(notEquals[2]!.trim());
	return telemetryText.includes(trimmed);
}

function jsonish(value: string): string {
	if (value === "true" || value === "false" || /^-?\d+(\.\d+)?$/.test(value)) return value;
	return JSON.stringify(value.replace(/^["']|["']$/g, ""));
}
