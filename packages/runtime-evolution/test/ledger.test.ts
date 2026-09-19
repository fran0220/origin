import { describe, expect, it } from "vitest";
import type { HarnessEdit, RefinementProposal } from "../src/index.js";
import {
	applyProposal,
	digestRefinementPayload,
	EvolutionError,
	EvolutionLedger,
	emptyEvolutionState,
	globalScope,
	HISTORY_DEPTH,
	HOST_ORIGIN,
	HOST_SOURCE,
	type LedgerRefusal,
	MAX_HARNESS_ENTRIES_PER_SCOPE,
	MAX_HARNESS_ENTRY_CONTENT_BYTES,
	MAX_REFINEMENT_EDITS,
	MemoryEvolutionLedgerStore,
	mergeHarnessLayers,
	REFINEMENT_SOURCE,
	renderHarnessSupplement,
	rollbackEvent,
	subjectScope,
	validateProposal,
} from "../src/index.js";

const NOW = 1_700_000_000_000;

function createProposal(edits: HarnessEdit[], summary = "keep the lesson"): RefinementProposal {
	return {
		summary,
		rationale: "the work established this",
		expectedOutcome: "later Turns start from it",
		edits,
	};
}

function promptCreate(title: string, content: string, id?: string): HarnessEdit {
	return {
		action: "create",
		entry: {
			...(id ? { id } : {}),
			kind: "prompt",
			title,
			content,
		},
	};
}

describe("continual-harness ledger", () => {
	it("seals a content-addressed event whose digest is stable for the same payload", async () => {
		const state = emptyEvolutionState(globalScope());
		const first = await applyProposal(
			state,
			createProposal([promptCreate("Always bazel", "This repo builds with bazel.", "always-bazel")]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		const second = await applyProposal(
			state,
			createProposal([promptCreate("Always bazel", "This repo builds with bazel.", "always-bazel")]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		expect(first.event.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
		expect(first.event.digest).toBe(second.event.digest);
		expect(first.event.parentDigest).toBeNull();
		expect(first.event.revision).toBe(1);
		expect(first.state.entries["always-bazel"]?.version).toBe(1);
	});

	it("commits with CAS and refuses a stale expectedRevision without merging", async () => {
		const store = new MemoryEvolutionLedgerStore();
		const ledger = new EvolutionLedger(store);
		const scope = subjectScope("proj-a");
		await ledger.record(
			scope,
			createProposal([promptCreate("Rule A", "A holds.", "rule-a")]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		const stale = await store.commit({
			scope,
			expectedRevision: 0,
			state: emptyEvolutionState(scope),
			event: (
				await applyProposal(
					emptyEvolutionState(scope),
					createProposal([promptCreate("Stale", "should not land", "stale")]),
					REFINEMENT_SOURCE,
					HOST_ORIGIN,
					NOW + 1,
				)
			).event,
		});
		expect(stale).toEqual({ status: "revision-conflict", storedRevision: 1 });
		const loaded = await ledger.state(scope);
		expect(loaded.revision).toBe(1);
		expect(loaded.entries["rule-a"]).toBeDefined();
		expect(loaded.entries.stale).toBeUndefined();
	});

	it("surfaces RevisionConflict when two commits race on the same revision", async () => {
		const store = new MemoryEvolutionLedgerStore();
		const ledger = new EvolutionLedger(store);
		const scope = globalScope();
		const results = await Promise.allSettled([
			ledger.record(scope, createProposal([promptCreate("A", "a", "a")]), REFINEMENT_SOURCE, HOST_ORIGIN, NOW),
			ledger.record(scope, createProposal([promptCreate("B", "b", "b")]), REFINEMENT_SOURCE, HOST_ORIGIN, NOW + 1),
		]);
		const fulfilled = results.filter((result) => result.status === "fulfilled");
		const rejected = results.filter((result) => result.status === "rejected");
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]?.status === "rejected" && rejected[0].reason).toMatchObject({ code: "revision-conflict" });
		const loaded = await ledger.state(scope);
		expect(loaded.revision).toBe(1);
		expect(Object.keys(loaded.entries)).toHaveLength(1);
	});

	it("isolates invalid edits as durable rejections and still advances revision", async () => {
		const store = new MemoryEvolutionLedgerStore();
		const ledger = new EvolutionLedger(store);
		const scope = globalScope();
		await ledger.record(
			scope,
			createProposal([promptCreate("Keep", "keep this", "keep")]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		const outcome = await ledger.record(
			scope,
			createProposal([
				{ action: "update", id: "keep", expectedVersion: 1, patch: { content: "updated keep" } },
				{ action: "update", id: "keep", expectedVersion: 1, patch: { content: "stale expected" } },
				{ action: "delete", id: "missing", expectedVersion: 1 },
			]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW + 1,
		);
		expect(outcome.revision).toBe(2);
		expect(outcome.applied).toHaveLength(1);
		expect(outcome.rejected).toHaveLength(2);
		expect(outcome.rejected[0]?.reason).toContain("expected version 1");
		expect((await ledger.state(scope)).entries.keep?.content).toBe("updated keep");
	});

	it("rolls back an applied event atomically and refuses when an entry moved", async () => {
		const store = new MemoryEvolutionLedgerStore();
		const ledger = new EvolutionLedger(store);
		const scope = subjectScope("home");
		const created = await ledger.record(
			scope,
			createProposal([promptCreate("Temp", "temporary rule", "temp")]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		const undone = await ledger.rollback(
			scope,
			created.digest,
			"taken back from the settings surface",
			HOST_ORIGIN,
			NOW + 1,
		);
		expect(undone.revision).toBe(2);
		expect((await ledger.state(scope)).entries.temp).toBeUndefined();
		const history = await ledger.history(scope, HISTORY_DEPTH);
		expect(history[0]?.kind).toBe("rollback");
		expect(history[0]?.rolledBackDigest).toBe(created.digest);

		await ledger.record(
			scope,
			createProposal([promptCreate("Temp", "temporary rule", "temp")]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW + 2,
		);
		const moved = await ledger.record(
			scope,
			createProposal([{ action: "update", id: "temp", expectedVersion: 1, patch: { content: "moved" } }]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW + 3,
		);
		const createDigest = (await ledger.history(scope, HISTORY_DEPTH)).find(
			(event) =>
				event.kind === "applied" &&
				event.applied[0]?.entryId === "temp" &&
				event.applied[0]?.edit.action === "create" &&
				event.digest !== created.digest,
		)?.digest;
		expect(createDigest).toBeDefined();
		await expect(
			ledger.rollback(scope, createDigest ?? "", "should fail", HOST_ORIGIN, NOW + 4),
		).rejects.toMatchObject({ code: "not-reversible" } satisfies Partial<LedgerRefusal>);
		expect((await ledger.state(scope)).entries.temp?.content).toBe("moved");
		expect(moved.revision).toBe(4);
	});

	it("refuses to roll back a rollback event", async () => {
		const store = new MemoryEvolutionLedgerStore();
		const ledger = new EvolutionLedger(store);
		const scope = globalScope();
		const created = await ledger.record(
			scope,
			createProposal([promptCreate("Once", "once", "once")]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		const undone = await ledger.rollback(scope, created.digest, "take it back", HOST_ORIGIN, NOW + 1);
		await expect(ledger.rollback(scope, undone.digest, "again", HOST_ORIGIN, NOW + 2)).rejects.toMatchObject({
			code: "not-reversible",
		});
	});

	it("promotes a subject entry into global without erasing the subject copy", async () => {
		const store = new MemoryEvolutionLedgerStore();
		const ledger = new EvolutionLedger(store);
		const subject = subjectScope("space-1");
		await ledger.record(
			subject,
			createProposal([promptCreate("Shared lesson", "use bazel", "shared-lesson")]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		const promoted = await ledger.promote(subject, "shared-lesson", HOST_ORIGIN, NOW + 1);
		expect(promoted.revision).toBe(1);
		expect((await ledger.state(globalScope())).entries["shared-lesson"]?.source).toBe("promote:space-1");
		expect((await ledger.state(subject)).entries["shared-lesson"]?.source).toBe("refine");
		await expect(ledger.promote(globalScope(), "shared-lesson", HOST_ORIGIN, NOW + 2)).rejects.toMatchObject({
			code: "failed",
		});
	});

	it("rejects a proposal that exceeds the edit budget", () => {
		const edits = Array.from({ length: MAX_REFINEMENT_EDITS + 1 }, (_, index) =>
			promptCreate(`Title ${index}`, `content ${index}`, `id-${index}`),
		);
		expect(() => validateProposal(createProposal(edits))).toThrow(EvolutionError);
	});

	it("rejects a create that would exceed the per-scope entry budget", async () => {
		const state = emptyEvolutionState(globalScope());
		const filled = { ...state, entries: { ...state.entries } };
		const entries: Record<string, ReturnType<typeof emptyEvolutionState>["entries"][string]> = {};
		for (let index = 0; index < MAX_HARNESS_ENTRIES_PER_SCOPE; index += 1) {
			const id = `e${index}`;
			entries[id] = {
				id,
				kind: "prompt",
				title: id,
				content: "x",
				source: "host",
				version: 1,
				createdAtMs: NOW,
				updatedAtMs: NOW,
			};
		}
		const full = { ...filled, entries };
		const result = await applyProposal(
			full,
			createProposal([promptCreate("Overflow", "too many", "overflow")]),
			HOST_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		expect(result.event.applied).toHaveLength(0);
		expect(result.event.rejected[0]?.reason).toContain("would exceed");
		expect(Object.keys(result.state.entries)).toHaveLength(MAX_HARNESS_ENTRIES_PER_SCOPE);
	});

	it("rejects content larger than 64 KB", async () => {
		const huge = "a".repeat(MAX_HARNESS_ENTRY_CONTENT_BYTES + 1);
		await expect(
			applyProposal(
				emptyEvolutionState(globalScope()),
				createProposal([promptCreate("Huge", huge, "huge")]),
				REFINEMENT_SOURCE,
				HOST_ORIGIN,
				NOW,
			),
		).rejects.toBeInstanceOf(EvolutionError);
	});
});

describe("harness rendering", () => {
	it("overlays subject entries on global ones of the same id and is order-deterministic", async () => {
		const store = new MemoryEvolutionLedgerStore();
		const ledger = new EvolutionLedger(store);
		await ledger.record(
			globalScope(),
			createProposal([promptCreate("Zed", "global zed", "zed"), promptCreate("Alpha", "global alpha", "alpha")]),
			HOST_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		await ledger.record(
			subjectScope("game"),
			createProposal([
				promptCreate("Alpha", "subject alpha", "alpha"),
				promptCreate("Beta", "subject beta", "beta"),
			]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW + 1,
		);
		const global = await ledger.state(globalScope());
		const subject = await ledger.state(subjectScope("game"));
		const merged = mergeHarnessLayers(global, subject);
		expect(merged.map((entry) => entry.id)).toEqual(["alpha", "beta", "zed"]);
		expect(merged.find((entry) => entry.id === "alpha")?.content).toBe("subject alpha");
		const rendered = renderHarnessSupplement(global, subject, await ledger.history(subjectScope("game"), 5));
		expect(rendered).toContain("<continual_harness>");
		expect(rendered).toContain("</continual_harness>");
		expect(rendered).toContain("### Alpha (subject · alpha · v1)");
		expect(rendered?.indexOf("### Alpha")).toBeLessThan(rendered?.indexOf("### Beta") ?? 0);
		expect(renderHarnessSupplement(global, subject, await ledger.history(subjectScope("game"), 5))).toBe(rendered);
	});

	it("returns null when both layers are empty", () => {
		expect(renderHarnessSupplement(emptyEvolutionState(globalScope()), null, [])).toBeNull();
	});
});

describe("digest domain", () => {
	it("binds the vetta evolution domain so payload-only hashes differ", async () => {
		const payload = { hello: "world" };
		const domainDigest = await digestRefinementPayload(payload);
		expect(domainDigest.startsWith("sha256:")).toBe(true);
		const again = await digestRefinementPayload(payload);
		expect(again).toBe(domainDigest);
		expect(await digestRefinementPayload({ hello: "worlds" })).not.toBe(domainDigest);
	});
});

describe("direct rollback of a moved entry", () => {
	it("throws NotReversible-compatible EvolutionError from the state machine", async () => {
		const created = await applyProposal(
			emptyEvolutionState(globalScope()),
			createProposal([promptCreate("X", "one", "x")]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW,
		);
		const updated = await applyProposal(
			created.state,
			createProposal([{ action: "update", id: "x", expectedVersion: 1, patch: { content: "two" } }]),
			REFINEMENT_SOURCE,
			HOST_ORIGIN,
			NOW + 1,
		);
		await expect(rollbackEvent(updated.state, created.event, "cannot", HOST_ORIGIN, NOW + 2)).rejects.toMatchObject({
			code: "rollback-conflict",
		});
	});
});
