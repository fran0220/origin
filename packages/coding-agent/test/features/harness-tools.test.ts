import {
	EvolutionLedger,
	HOST_ORIGIN,
	MemoryEvolutionLedgerStore,
	REFINEMENT_SOURCE,
	subjectScope,
} from "@vetta/runtime-evolution";
import { describe, expect, it } from "vitest";
import {
	createHarnessListTool,
	createHarnessPromoteTool,
	createHarnessRefineTool,
	createHarnessRollbackTool,
	HARNESS_LIST_TOOL_NAME,
	HARNESS_PROMOTE_TOOL_NAME,
	HARNESS_REFINE_TOOL_NAME,
	HARNESS_ROLLBACK_TOOL_NAME,
} from "../../src/features/harness/index.js";

const NOW = 1_700_000_200_000;

function host(ledger = new EvolutionLedger(new MemoryEvolutionLedgerStore())) {
	return { ledger, subject: subjectScope("/tmp/game"), now: () => NOW };
}

describe("harness tools", () => {
	it("records a refinement with origin from the execution request and lists the new entry", async () => {
		const tools = host();
		const refine = createHarnessRefineTool(tools);
		const listed = createHarnessListTool(tools);
		const result = await refine.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "call-1",
			input: {
				description: "record bazel",
				summary: "keep bazel",
				rationale: "the build used bazel",
				expectedOutcome: "later Turns start from it",
				edits: [{ action: "create", entry: { id: "bazel", kind: "prompt", title: "Bazel", content: "use bazel" } }],
			},
			signal: new AbortController().signal,
		});
		expect(result.details).toMatchObject({ revision: 1, applied: [{ entryId: "bazel" }] });
		const listedResult = await listed.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "call-2",
			input: { description: "list harness", layer: "subject" },
			signal: new AbortController().signal,
		});
		expect(listedResult.details).toMatchObject({
			subjectRevision: 1,
			subject: [{ id: "bazel", title: "Bazel", version: 1 }],
		});
		const stored = await tools.ledger.history(tools.subject, 8);
		expect(stored[0]?.origin).toEqual({ sessionId: "session-1", turnId: "turn-1", toolCallId: "call-1" });
	});

	it("keeps tool names stable for model-visible registration", () => {
		const tools = host();
		expect(createHarnessRefineTool(tools).name).toBe(HARNESS_REFINE_TOOL_NAME);
		expect(createHarnessListTool(tools).name).toBe(HARNESS_LIST_TOOL_NAME);
		expect(createHarnessRollbackTool(tools).name).toBe(HARNESS_ROLLBACK_TOOL_NAME);
		expect(createHarnessPromoteTool(tools).name).toBe(HARNESS_PROMOTE_TOOL_NAME);
	});

	it("promotes a subject entry into the shared baseline", async () => {
		const tools = host();
		await tools.ledger.record(
			tools.subject,
			{
				summary: "keep bazel",
				rationale: "the build used bazel",
				expectedOutcome: "later Turns start from it",
				edits: [{ action: "create", entry: { id: "bazel", kind: "prompt", title: "Bazel", content: "use bazel" } }],
			},
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		const promote = createHarnessPromoteTool(tools);
		const result = await promote.execute({
			sessionId: "session-1",
			turnId: "turn-2",
			toolCallId: "call-3",
			input: { description: "promote bazel", entryId: "bazel" },
			signal: new AbortController().signal,
		});
		expect(result.details).toMatchObject({ revision: 1 });
		const global = await tools.ledger.state({ kind: "global" });
		expect(global.entries.bazel?.source).toBe("promote:/tmp/game");
	});
});
