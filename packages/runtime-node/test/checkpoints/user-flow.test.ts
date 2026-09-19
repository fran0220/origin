import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointReactor, MemoryCheckpointStore } from "@origin/runtime-checkpoints";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeWorkTreeVcs } from "../../src/checkpoints/shadow-vcs.js";
import { createNodeVerificationRunner } from "../../src/checkpoints/verification-runner.js";

const dirs: string[] = [];

afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("checkpoint user flow", () => {
	it("completes a turn, keeps a failed verification, then reverts files with a new commit", async () => {
		const cwd = await mkdtemp(join(tmpdir(), "ckpt-flow-work-"));
		const agentDir = await mkdtemp(join(tmpdir(), "ckpt-flow-agent-"));
		dirs.push(cwd, agentDir);
		await writeFile(join(cwd, "app.txt"), "good\n", "utf8");
		const store = new MemoryCheckpointStore();
		await store.writePolicy({
			projectKey: "demo",
			vcsMode: "shadow",
			verificationCommands: [],
			onVerificationFailure: "keep-for-user",
		});
		const reactor = new CheckpointReactor({
			store,
			vcs: createNodeWorkTreeVcs({ checkpointRoot: join(agentDir, "checkpoints") }),
			runner: createNodeVerificationRunner(),
			cwdFor: () => cwd,
		});

		const baseline = await reactor.propose({
			projectKey: "demo",
			sessionId: "session-1",
			turnId: "turn-1",
			intent: "baseline",
			verificationCommands: [],
			cwd,
		});
		expect(baseline.checkpoint.decision).toBe("kept");

		await writeFile(join(cwd, "app.txt"), "broken\n", "utf8");
		await store.writePolicy({
			projectKey: "demo",
			vcsMode: "shadow",
			verificationCommands: ["false"],
			onVerificationFailure: "keep-for-user",
		});
		const proposed = await reactor.propose({
			projectKey: "demo",
			sessionId: "session-1",
			turnId: "turn-2",
			intent: "Turn completed",
			verificationCommands: ["false"],
			cwd,
		});
		expect(proposed.checkpoint.phase).toBe("settled");
		expect(proposed.checkpoint.decision).toBe("kept");
		expect(proposed.checkpoint.verification[0]?.state).toMatchObject({
			state: "settled",
			outcome: { kind: "exited", code: 1 },
		});
		const landed = proposed.checkpoint.landed?.commit;
		expect(landed).toBeTruthy();
		expect(await readFile(join(cwd, "app.txt"), "utf8")).toBe("broken\n");

		const reverted = await reactor.requestRevert("demo", proposed.checkpoint.id);
		expect(reverted.decision).toBe("reverted");
		expect(reverted.revertedBy?.commit).not.toBe(landed);
		expect(await readFile(join(cwd, "app.txt"), "utf8")).toBe("good\n");
	});
});
