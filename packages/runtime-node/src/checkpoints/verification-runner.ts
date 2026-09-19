import { spawn } from "node:child_process";
import type { ExecutionReceipt, VerificationRunInput, VerificationRunner } from "@origin/runtime-checkpoints";
import { outcomeFromCommandResult } from "./receipt-emitter.js";

export interface NodeVerificationRunnerOptions {
	readonly shell?: { readonly executable: string; readonly args: readonly string[] };
	readonly environment?: () => NodeJS.ProcessEnv;
}

export function createNodeVerificationRunner(options: NodeVerificationRunnerOptions = {}): VerificationRunner {
	const running = new Map<string, Promise<ExecutionReceipt>>();
	const shell = options.shell ?? defaultShell();
	return {
		async inspect(executionId) {
			if (running.has(executionId)) return "running";
			return undefined;
		},
		async run(input) {
			const inFlight = running.get(input.executionId);
			if (inFlight) return inFlight;
			const task = runCommand(shell, options.environment, input).finally(() => {
				running.delete(input.executionId);
			});
			running.set(input.executionId, task);
			return task;
		},
	};
}

function defaultShell(): { readonly executable: string; readonly args: readonly string[] } {
	if (process.platform === "win32") return { executable: "cmd.exe", args: ["/d", "/s", "/c"] };
	return { executable: "/bin/sh", args: ["-c"] };
}

async function runCommand(
	shell: { readonly executable: string; readonly args: readonly string[] },
	environment: (() => NodeJS.ProcessEnv) | undefined,
	input: VerificationRunInput,
): Promise<ExecutionReceipt> {
	const startedAt = Date.now();
	return new Promise((resolvePromise) => {
		const child = spawn(shell.executable, [...shell.args, input.command], {
			cwd: input.cwd,
			env: environment?.() ?? process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let settled = false;
		const finish = (outcome: ExecutionReceipt["outcome"]) => {
			if (settled) return;
			settled = true;
			input.signal?.removeEventListener("abort", onAbort);
			resolvePromise({
				recordType: "checkpoint.execution-receipt",
				schemaVersion: 1,
				executionId: input.executionId,
				sessionId: input.sessionId,
				turnId: input.turnId,
				command: input.command,
				cwd: input.cwd,
				startedAt,
				endedAt: Date.now(),
				outcome,
			});
		};
		const onAbort = () => {
			if (child.pid) child.kill("SIGTERM");
			else child.kill();
			finish({ kind: "cancelled" });
		};
		if (input.signal?.aborted) {
			onAbort();
			return;
		}
		input.signal?.addEventListener("abort", onAbort, { once: true });
		child.once("error", () => finish({ kind: "failed-to-start" }));
		child.once("exit", (code, signal) => {
			finish(
				outcomeFromCommandResult({
					exitCode: code,
					signal: signal ? signalToNumber(signal) : undefined,
					cancelled: input.signal?.aborted === true,
				}),
			);
		});
	});
}

function signalToNumber(signal: NodeJS.Signals): number {
	const table: Record<string, number> = { SIGINT: 2, SIGTERM: 15, SIGKILL: 9 };
	return table[signal] ?? 0;
}
