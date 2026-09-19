import { describe, expect, it } from "vitest";
import {
	allVerificationsPassed,
	canRequestRevert,
	canRerunVerification,
	createProposedCheckpoint,
	decideAfterFailedVerification,
	interruptRunningVerification,
	type MainlineCheckpoint,
	type MainlineCommit,
	markFailed,
	markLanded,
	markReverted,
	markReverting,
	markVerificationRunning,
	markVerificationSettled,
	nextUnsettledVerification,
	pendingEffects,
	resetVerificationForRerun,
	verificationOutcomePassed,
} from "../src/index.js";

const commit: MainlineCommit = {
	commit: "abc123",
	parent: null,
	paths: ["src/a.ts"],
	added: 3,
	removed: 1,
};

function proposed(commands: readonly string[] = ["bun test"]): MainlineCheckpoint {
	return createProposedCheckpoint({
		id: "cp_1",
		operationId: "turn:session-1:turn-1",
		createdAt: 10,
		propose: {
			projectKey: "proj",
			sessionId: "session-1",
			turnId: "turn-1",
			intent: "implement checkpoints",
			verificationCommands: commands,
			cwd: "/tmp/work",
		},
	});
}

describe("checkpoint state machine", () => {
	it("proposes a verifying checkpoint with queued commands", () => {
		const checkpoint = proposed(["bun test", "bun run check"]);
		expect(checkpoint.phase).toBe("verifying");
		expect(checkpoint.verification).toHaveLength(2);
		expect(checkpoint.verification[0]?.state).toEqual({ state: "queued" });
		expect(nextUnsettledVerification(checkpoint)?.index).toBe(0);
	});

	it("treats only Exited{0} as a passing outcome", () => {
		expect(verificationOutcomePassed({ kind: "exited", code: 0 })).toBe(true);
		expect(verificationOutcomePassed({ kind: "exited", code: 1 })).toBe(false);
		expect(verificationOutcomePassed({ kind: "cancelled" })).toBe(false);
		expect(verificationOutcomePassed({ kind: "interrupted" })).toBe(false);
	});

	it("records running then settled verification without inventing an exit code", () => {
		const running = markVerificationRunning(proposed(), 0, "exec-1", 11);
		expect(running.verification[0]?.state).toEqual({ state: "running", executionId: "exec-1" });
		const settled = markVerificationSettled(running, 0, "exec-1", { kind: "exited", code: 0 }, 12);
		expect(settled.verification[0]?.state).toEqual({
			state: "settled",
			executionId: "exec-1",
			outcome: { kind: "exited", code: 0 },
		});
		expect(allVerificationsPassed(settled)).toBe(true);
	});

	it("lands as kept after a successful snapshot", () => {
		const kept = markLanded(proposed([]), commit, 20);
		expect(kept.phase).toBe("settled");
		expect(kept.decision).toBe("kept");
		expect(kept.landed).toEqual(commit);
		expect(canRequestRevert(kept)).toBe(true);
	});

	it("turns a kept checkpoint into reverting then reverted without rewriting history", () => {
		const kept = markLanded(proposed([]), commit, 20);
		const reverting = markReverting(kept, "op_revert", 21);
		expect(reverting.phase).toBe("reverting");
		expect(reverting.revertOperationId).toBe("op_revert");
		const reverted = markReverted(reverting, { ...commit, commit: "def456", parent: "abc123" }, 22);
		expect(reverted.phase).toBe("settled");
		expect(reverted.decision).toBe("reverted");
		expect(reverted.landed?.commit).toBe("abc123");
		expect(reverted.revertedBy?.commit).toBe("def456");
		expect(canRequestRevert(reverted)).toBe(false);
	});

	it("interrupts running verification after a crash with no receipt", () => {
		const running = markVerificationRunning(proposed(), 0, "exec-crash", 11);
		const interrupted = interruptRunningVerification(running, 12);
		expect(interrupted.verification[0]?.state).toEqual({
			state: "settled",
			executionId: "exec-crash",
			outcome: { kind: "interrupted" },
		});
		expect(allVerificationsPassed(interrupted)).toBe(false);
	});

	it("keeps a failed verification for the user by default", () => {
		const failed = markVerificationSettled(proposed(), 0, "exec-1", { kind: "exited", code: 2 }, 12);
		const landed = { ...failed, landed: commit };
		const decided = decideAfterFailedVerification(landed, "keep-for-user", 13);
		expect(decided.decision).toBe("kept");
		expect(decided.checkpoint.phase).toBe("settled");
		expect(decided.checkpoint.decision).toBe("kept");
		expect(canRerunVerification(decided.checkpoint)).toBe(true);
	});

	it("auto-reverts a failed verification when the project policy asks for it", () => {
		const failed = markVerificationSettled(proposed(), 0, "exec-1", { kind: "timed-out" }, 12);
		const landed = { ...failed, landed: commit };
		const decided = decideAfterFailedVerification(landed, "auto-revert", 13);
		expect(decided.decision).toBe("reverting");
		expect(decided.checkpoint.phase).toBe("reverting");
	});

	it("resets verification queues when the user reruns", () => {
		const failed = markVerificationSettled(proposed(["bun test"]), 0, "exec-1", { kind: "exited", code: 1 }, 12);
		const rerun = resetVerificationForRerun(failed, 13);
		expect(rerun.phase).toBe("verifying");
		expect(rerun.verification[0]?.state).toEqual({ state: "queued" });
	});

	it("records a durable failure without dropping the checkpoint identity", () => {
		const failed = markFailed(proposed(), "git add failed", 15);
		expect(failed.phase).toBe("failed");
		expect(failed.error).toBe("git add failed");
		expect(failed.id).toBe("cp_1");
	});
});

describe("pending effects", () => {
	it("lands before verifying so a restore point always exists", () => {
		const effects = pendingEffects(proposed(["bun test"]), () => "exec-1");
		expect(effects).toHaveLength(1);
		expect(effects[0]?.kind).toBe("land");
	});

	it("verifies the next queued command after land", () => {
		const landed = { ...proposed(["bun test"]), landed: commit };
		const effects = pendingEffects(landed, () => "exec-1");
		expect(effects[0]).toMatchObject({ kind: "verify", recordStart: true, executionId: "exec-1" });
	});

	it("resumes a running verification without recording start again", () => {
		const running = markVerificationRunning({ ...proposed(["bun test"]), landed: commit }, 0, "exec-1", 11);
		const effects = pendingEffects(running, () => "unused");
		expect(effects[0]).toMatchObject({ kind: "verify", recordStart: false, executionId: "exec-1" });
	});

	it("emits revert after the user asks to roll files back", () => {
		const reverting = markReverting(markLanded(proposed([]), commit, 20), "op_revert", 21);
		const effects = pendingEffects(reverting, () => "unused");
		expect(effects[0]?.kind).toBe("revert");
	});
});
