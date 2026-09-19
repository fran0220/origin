import { describe, expect, it } from "vitest";
import {
	CheckpointReactor,
	type ExecutionReceipt,
	type MainlineCommit,
	MemoryCheckpointStore,
	type VerificationRunInput,
	type VerificationRunner,
	type WorkTreeVcs,
} from "../src/index.js";

const commit: MainlineCommit = {
	commit: "landed1",
	parent: null,
	paths: ["README.md"],
	added: 1,
	removed: 0,
};

function createVcs(overrides?: Partial<WorkTreeVcs>): WorkTreeVcs {
	return {
		async land() {
			return commit;
		},
		async restore() {
			return { ...commit, commit: "reverted1", parent: "landed1" };
		},
		async diff() {
			return {
				fromCommit: commit.commit,
				toCommit: null,
				paths: commit.paths,
				added: commit.added,
				removed: commit.removed,
				patch: "",
			};
		},
		...overrides,
	};
}

function passingRunner(): VerificationRunner {
	return {
		async run(input: VerificationRunInput): Promise<ExecutionReceipt> {
			return {
				recordType: "checkpoint.execution-receipt",
				schemaVersion: 1,
				executionId: input.executionId,
				sessionId: input.sessionId,
				turnId: input.turnId,
				command: input.command,
				cwd: input.cwd,
				startedAt: 1,
				endedAt: 2,
				outcome: { kind: "exited", code: 0 },
			};
		},
		async inspect() {
			return undefined;
		},
	};
}

function failingRunner(code = 1): VerificationRunner {
	return {
		async run(input: VerificationRunInput): Promise<ExecutionReceipt> {
			return {
				recordType: "checkpoint.execution-receipt",
				schemaVersion: 1,
				executionId: input.executionId,
				sessionId: input.sessionId,
				turnId: input.turnId,
				command: input.command,
				cwd: input.cwd,
				startedAt: 1,
				endedAt: 2,
				outcome: { kind: "exited", code },
			};
		},
		async inspect() {
			return undefined;
		},
	};
}

describe("CheckpointReactor", () => {
	it("lands and keeps a turn with no verification commands", async () => {
		const store = new MemoryCheckpointStore();
		const reactor = new CheckpointReactor({
			store,
			vcs: createVcs(),
			runner: passingRunner(),
			cwdFor: () => "/tmp/work",
			clock: { now: () => 100 },
		});

		const { checkpoint, created } = await reactor.propose({
			projectKey: "proj",
			sessionId: "session-1",
			turnId: "turn-1",
			intent: "add timeline",
			verificationCommands: [],
			cwd: "/tmp/work",
		});

		expect(created).toBe(true);
		expect(checkpoint.phase).toBe("settled");
		expect(checkpoint.decision).toBe("kept");
		expect(checkpoint.landed?.commit).toBe("landed1");
	});

	it("is idempotent for the same session turn", async () => {
		const store = new MemoryCheckpointStore();
		const reactor = new CheckpointReactor({
			store,
			vcs: createVcs(),
			runner: passingRunner(),
			cwdFor: () => "/tmp/work",
		});
		const first = await reactor.propose({
			projectKey: "proj",
			sessionId: "session-1",
			turnId: "turn-1",
			intent: "add timeline",
			verificationCommands: [],
			cwd: "/tmp/work",
		});
		const second = await reactor.propose({
			projectKey: "proj",
			sessionId: "session-1",
			turnId: "turn-1",
			intent: "add timeline again",
			verificationCommands: [],
			cwd: "/tmp/work",
		});
		expect(second.created).toBe(false);
		expect(second.checkpoint.id).toBe(first.checkpoint.id);
		expect(await reactor.list("proj")).toHaveLength(1);
	});

	it("lands, runs verification, and keeps a passing command", async () => {
		const store = new MemoryCheckpointStore();
		const reactor = new CheckpointReactor({
			store,
			vcs: createVcs(),
			runner: passingRunner(),
			cwdFor: () => "/tmp/work",
		});
		const { checkpoint } = await reactor.propose({
			projectKey: "proj",
			sessionId: "session-1",
			turnId: "turn-2",
			intent: "verify tests",
			verificationCommands: ["bun test"],
			cwd: "/tmp/work",
		});
		expect(checkpoint.phase).toBe("settled");
		expect(checkpoint.decision).toBe("kept");
		expect(checkpoint.verification[0]?.state).toMatchObject({
			state: "settled",
			outcome: { kind: "exited", code: 0 },
		});
		expect(await store.listReceipts("proj")).toHaveLength(1);
	});

	it("keeps a failed verification for the user so Timeline can one-click revert", async () => {
		const store = new MemoryCheckpointStore();
		const reactor = new CheckpointReactor({
			store,
			vcs: createVcs(),
			runner: failingRunner(7),
			cwdFor: () => "/tmp/work",
		});
		const { checkpoint } = await reactor.propose({
			projectKey: "proj",
			sessionId: "session-1",
			turnId: "turn-3",
			intent: "failing tests",
			verificationCommands: ["bun test"],
			cwd: "/tmp/work",
		});
		expect(checkpoint.phase).toBe("settled");
		expect(checkpoint.decision).toBe("kept");
		expect(checkpoint.landed?.commit).toBe("landed1");
		expect(checkpoint.verification[0]?.state).toMatchObject({
			state: "settled",
			outcome: { kind: "exited", code: 7 },
		});

		const reverted = await reactor.requestRevert("proj", checkpoint.id);
		expect(reverted.phase).toBe("settled");
		expect(reverted.decision).toBe("reverted");
		expect(reverted.revertedBy?.commit).toBe("reverted1");
		expect(reverted.landed?.commit).toBe("landed1");
	});

	it("resumes after a crash that left verification running without a receipt", async () => {
		const store = new MemoryCheckpointStore();
		await store.append({
			recordType: "checkpoint.mainline",
			schemaVersion: 1,
			id: "cp_crash",
			operationId: "turn:session-1:turn-9",
			projectKey: "proj",
			sessionId: "session-1",
			turnId: "turn-9",
			intent: "crash mid verify",
			createdAt: 1,
			updatedAt: 2,
			phase: "verifying",
			landed: commit,
			verification: [
				{
					command: "bun test",
					cwd: "/tmp/work",
					state: { state: "running", executionId: "exec-missing" },
				},
			],
		});
		const runner: VerificationRunner = {
			async run(input) {
				return {
					recordType: "checkpoint.execution-receipt",
					schemaVersion: 1,
					executionId: input.executionId,
					sessionId: input.sessionId,
					turnId: input.turnId,
					command: input.command,
					cwd: input.cwd,
					startedAt: 3,
					endedAt: 4,
					outcome: { kind: "exited", code: 0 },
				};
			},
			async inspect() {
				return undefined;
			},
		};
		const reactor = new CheckpointReactor({
			store,
			vcs: createVcs(),
			runner,
			cwdFor: () => "/tmp/work",
		});

		const recovered = await reactor.recover("proj");
		expect(recovered[0]?.verification[0]?.state).toMatchObject({
			state: "settled",
			outcome: { kind: "interrupted" },
		});
		const latest = await reactor.get("proj", "cp_crash");
		expect(latest?.phase).toBe("settled");
		expect(latest?.decision).toBe("kept");
	});

	it("continues a running verification when the receipt already exists after restart", async () => {
		const store = new MemoryCheckpointStore();
		await store.append({
			recordType: "checkpoint.mainline",
			schemaVersion: 1,
			id: "cp_resume",
			operationId: "turn:session-1:turn-8",
			projectKey: "proj",
			sessionId: "session-1",
			turnId: "turn-8",
			intent: "resume verify",
			createdAt: 1,
			updatedAt: 2,
			phase: "verifying",
			landed: commit,
			verification: [
				{
					command: "bun test",
					cwd: "/tmp/work",
					state: { state: "running", executionId: "exec-ready" },
				},
			],
		});
		const receipt: ExecutionReceipt = {
			recordType: "checkpoint.execution-receipt",
			schemaVersion: 1,
			executionId: "exec-ready",
			sessionId: "session-1",
			turnId: "turn-8",
			command: "bun test",
			cwd: "/tmp/work",
			startedAt: 1,
			endedAt: 2,
			outcome: { kind: "exited", code: 0 },
		};
		const runner: VerificationRunner = {
			async run() {
				throw new Error("should reuse the existing receipt");
			},
			async inspect(executionId) {
				return executionId === "exec-ready" ? receipt : undefined;
			},
		};
		const reactor = new CheckpointReactor({
			store,
			vcs: createVcs(),
			runner,
			cwdFor: () => "/tmp/work",
		});
		await reactor.recover("proj");
		const latest = await reactor.get("proj", "cp_resume");
		expect(latest?.phase).toBe("settled");
		expect(latest?.decision).toBe("kept");
		expect(latest?.verification[0]?.state).toMatchObject({
			state: "settled",
			outcome: { kind: "exited", code: 0 },
		});
	});
});
