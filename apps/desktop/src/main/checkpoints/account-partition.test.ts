import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MainlineCheckpoint } from "@origin/runtime-checkpoints";
import { checkpointMainlinePath, FileCheckpointStore } from "@origin/runtime-node/checkpoints";
import { afterEach, describe, expect, it } from "vitest";

const dirs: string[] = [];

afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function checkpoint(id: string): MainlineCheckpoint {
	return {
		recordType: "checkpoint.mainline",
		schemaVersion: 1,
		id,
		operationId: `turn:s:${id}`,
		projectKey: "home",
		sessionId: "s",
		turnId: id,
		intent: "Turn completed",
		createdAt: 1,
		updatedAt: 1,
		verification: [],
		phase: "settled",
		decision: "kept",
	};
}

describe("checkpoint account partitions", () => {
	it("puts unsigned-in data in logged-out/checkpoints and keeps signed-in accounts apart", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "ckpt-account-"));
		dirs.push(agentDir);
		const loggedOut = join(agentDir, "logged-out", "checkpoints");
		const accountA = join(agentDir, "accounts", "aaa", "checkpoints");
		const accountB = join(agentDir, "accounts", "bbb", "checkpoints");
		expect(loggedOut).not.toBe(accountA);
		expect(accountA).not.toBe(accountB);

		const unsigned = new FileCheckpointStore({ checkpointRoot: loggedOut });
		await unsigned.append(checkpoint("logged-out-cp"));
		expect(await readFile(checkpointMainlinePath(loggedOut, "home"), "utf8")).toContain("logged-out-cp");

		const signedIn = new FileCheckpointStore({ checkpointRoot: accountA });
		await signedIn.append(checkpoint("alice-cp"));
		expect((await signedIn.list("home")).map((record) => record.id)).toEqual(["alice-cp"]);
		expect((await unsigned.list("home")).map((record) => record.id)).toEqual(["logged-out-cp"]);
		await expect(readFile(join(agentDir, "checkpoints", "home", "mainline.jsonl"), "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});
});
