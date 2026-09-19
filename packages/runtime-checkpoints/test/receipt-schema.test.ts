import { describe, expect, it } from "vitest";
import {
	isExecutionReceipt,
	isMainlineCheckpoint,
	parseExecutionReceipt,
	parseMainlineCheckpoint,
} from "../src/index.js";

describe("checkpoint record schema", () => {
	it("accepts a complete execution receipt", () => {
		const receipt = {
			recordType: "checkpoint.execution-receipt",
			schemaVersion: 1,
			executionId: "exec-1",
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "call-1",
			command: "bun test",
			cwd: "/tmp/work",
			startedAt: 1,
			endedAt: 2,
			outcome: { kind: "exited", code: 0 },
		};
		expect(isExecutionReceipt(receipt)).toBe(true);
		expect(parseExecutionReceipt(receipt)?.executionId).toBe("exec-1");
	});

	it("accepts a receipt without toolCallId for verification commands", () => {
		expect(
			isExecutionReceipt({
				recordType: "checkpoint.execution-receipt",
				schemaVersion: 1,
				executionId: "exec-2",
				sessionId: "session-1",
				turnId: "turn-1",
				command: "bun test",
				cwd: "/tmp/work",
				startedAt: 1,
				endedAt: 2,
				outcome: { kind: "timed-out" },
			}),
		).toBe(true);
	});

	it("rejects an unknown outcome kind", () => {
		expect(
			isExecutionReceipt({
				recordType: "checkpoint.execution-receipt",
				schemaVersion: 1,
				executionId: "exec-3",
				sessionId: "session-1",
				turnId: "turn-1",
				command: "bun test",
				cwd: "/tmp/work",
				startedAt: 1,
				endedAt: 2,
				outcome: { kind: "boom" },
			}),
		).toBe(false);
	});

	it("accepts a mainline checkpoint and rejects extra fields", () => {
		const checkpoint = {
			recordType: "checkpoint.mainline",
			schemaVersion: 1,
			id: "cp_1",
			operationId: "op_1",
			projectKey: "proj",
			sessionId: "session-1",
			turnId: "turn-1",
			intent: "land files",
			createdAt: 1,
			updatedAt: 1,
			verification: [],
			phase: "verifying",
		};
		expect(isMainlineCheckpoint(checkpoint)).toBe(true);
		expect(parseMainlineCheckpoint({ ...checkpoint, extra: true })).toBeUndefined();
	});
});
