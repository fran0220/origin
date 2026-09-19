import { randomBytes } from "node:crypto";
import type { ExecutionReceipt, VerificationOutcome } from "@vetta/runtime-checkpoints";

export interface ExecutionReceiptSink {
	record(receipt: ExecutionReceipt): Promise<void> | void;
}

export interface ExecutionReceiptContext {
	readonly sessionId: string;
	readonly turnId: string;
	readonly toolCallId?: string;
	readonly command: string;
	readonly cwd: string;
}

export interface ExecutionReceiptCollector {
	begin(context: ExecutionReceiptContext): ExecutionReceiptSession;
}

export interface ExecutionReceiptSession {
	readonly executionId: string;
	settle(outcome: VerificationOutcome): Promise<ExecutionReceipt>;
}

const sinks = new Set<ExecutionReceiptSink>();

export function registerExecutionReceiptSink(sink: ExecutionReceiptSink): () => void {
	sinks.add(sink);
	return () => {
		sinks.delete(sink);
	};
}

export function createExecutionId(): string {
	return `exec_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
}

export function createExecutionReceiptCollector(now: () => number = Date.now): ExecutionReceiptCollector {
	return {
		begin(context) {
			const executionId = createExecutionId();
			const startedAt = now();
			return {
				executionId,
				async settle(outcome) {
					const receipt: ExecutionReceipt = {
						recordType: "checkpoint.execution-receipt",
						schemaVersion: 1,
						executionId,
						sessionId: context.sessionId,
						turnId: context.turnId,
						...(context.toolCallId ? { toolCallId: context.toolCallId } : {}),
						command: context.command,
						cwd: context.cwd,
						startedAt,
						endedAt: now(),
						outcome,
					};
					for (const sink of sinks) await sink.record(receipt);
					return receipt;
				},
			};
		},
	};
}

export function outcomeFromCommandResult(input: {
	readonly exitCode?: number | null;
	readonly cancelled?: boolean;
	readonly timedOut?: boolean;
	readonly failedToStart?: boolean;
	readonly signal?: number;
}): VerificationOutcome {
	if (input.failedToStart) return { kind: "failed-to-start" };
	if (input.timedOut) return { kind: "timed-out" };
	if (input.cancelled) return { kind: "cancelled" };
	if (typeof input.signal === "number") return { kind: "signalled", signal: input.signal };
	if (typeof input.exitCode === "number") return { kind: "exited", code: input.exitCode };
	return { kind: "unknown" };
}

let defaultCollector: ExecutionReceiptCollector | undefined;

export function getExecutionReceiptCollector(): ExecutionReceiptCollector {
	defaultCollector ??= createExecutionReceiptCollector();
	return defaultCollector;
}

export function setExecutionReceiptCollectorForTests(collector: ExecutionReceiptCollector | undefined): void {
	defaultCollector = collector;
}
