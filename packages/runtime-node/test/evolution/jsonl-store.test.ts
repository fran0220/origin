import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applyProposal,
	EvolutionLedger,
	emptyEvolutionState,
	globalScope,
	HOST_ORIGIN,
	REFINEMENT_SOURCE,
	subjectScope,
} from "@origin/runtime-evolution";
import { describe, expect, it } from "vitest";
import { createFileEvolutionLedgerStore } from "../../src/evolution/index.js";

const NOW = 1_700_000_100_000;

describe("FileEvolutionLedgerStore", () => {
	it("atomically appends events and enforces CAS across reloads", async () => {
		const root = await mkdtemp(join(tmpdir(), "origin-evolution-"));
		const store = createFileEvolutionLedgerStore(root);
		const ledger = new EvolutionLedger(store);
		const scope = subjectScope("game-one");
		await ledger.record(
			scope,
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
		const reloaded = new EvolutionLedger(createFileEvolutionLedgerStore(root));
		const state = await reloaded.state(scope);
		expect(state.revision).toBe(1);
		expect(state.entries.bazel?.content).toBe("use bazel");

		const stale = await applyProposal(
			emptyEvolutionState(scope),
			{
				summary: "stale",
				rationale: "should not land",
				expectedOutcome: "none",
				edits: [{ action: "create", entry: { id: "stale", kind: "prompt", title: "Stale", content: "no" } }],
			},
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW + 1,
		);
		const result = await store.commit({
			scope,
			expectedRevision: 0,
			state: stale.state,
			event: stale.event,
		});
		expect(result.status).toBe("revision-conflict");
		const text = await readFile(join(root, "subjects", "game-one.jsonl"), "utf8");
		expect(text.split("\n").filter(Boolean)).toHaveLength(1);
	});

	it("keeps global and subject files separate", async () => {
		const root = await mkdtemp(join(tmpdir(), "origin-evolution-"));
		const ledger = new EvolutionLedger(createFileEvolutionLedgerStore(root));
		await ledger.record(
			globalScope(),
			{
				summary: "global",
				rationale: "baseline",
				expectedOutcome: "everywhere",
				edits: [{ action: "create", entry: { id: "g", kind: "prompt", title: "G", content: "global" } }],
			},
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		await ledger.record(
			subjectScope("home"),
			{
				summary: "home",
				rationale: "subject",
				expectedOutcome: "home only",
				edits: [{ action: "create", entry: { id: "h", kind: "prompt", title: "H", content: "home" } }],
			},
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		expect((await ledger.state(globalScope())).entries.g).toBeDefined();
		expect((await ledger.state(subjectScope("home"))).entries.h).toBeDefined();
		expect((await ledger.state(globalScope())).entries.h).toBeUndefined();
	});

	it("keeps project path subjects in distinct files", async () => {
		const root = await mkdtemp(join(tmpdir(), "origin-evolution-"));
		const ledger = new EvolutionLedger(createFileEvolutionLedgerStore(root));
		const alpha = subjectScope("/tmp/game");
		const beta = subjectScope("/tmp/game-two");
		await ledger.record(
			alpha,
			{
				summary: "alpha",
				rationale: "first project",
				expectedOutcome: "alpha only",
				edits: [{ action: "create", entry: { id: "a", kind: "prompt", title: "A", content: "alpha" } }],
			},
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		await ledger.record(
			beta,
			{
				summary: "beta",
				rationale: "second project",
				expectedOutcome: "beta only",
				edits: [{ action: "create", entry: { id: "b", kind: "prompt", title: "B", content: "beta" } }],
			},
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		expect((await ledger.state(alpha)).entries.a?.content).toBe("alpha");
		expect((await ledger.state(beta)).entries.b?.content).toBe("beta");
		expect((await ledger.state(alpha)).entries.b).toBeUndefined();
		const alphaFile = await readFile(join(root, "subjects", `${encodeURIComponent("/tmp/game")}.jsonl`), "utf8");
		expect(alphaFile).toContain('"id":"a"');
	});
});
