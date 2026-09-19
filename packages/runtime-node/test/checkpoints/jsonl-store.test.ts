import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MainlineCheckpoint } from "@origin/runtime-checkpoints";
import { afterEach, describe, expect, it } from "vitest";
import { FileCheckpointStore } from "../../src/checkpoints/jsonl-store.js";
import { checkpointMainlinePath } from "../../src/checkpoints/layout.js";

const dirs: string[] = [];

afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function checkpoint(overrides?: Partial<MainlineCheckpoint>): MainlineCheckpoint {
	return {
		recordType: "checkpoint.mainline",
		schemaVersion: 1,
		id: "cp_1",
		operationId: "turn:s:t1",
		projectKey: "home",
		sessionId: "s",
		turnId: "t1",
		intent: "Turn completed",
		createdAt: 1,
		updatedAt: 1,
		verification: [],
		phase: "settled",
		decision: "kept",
		...overrides,
	};
}

describe("FileCheckpointStore", () => {
	it("writes under the supplied checkpoint root, not <agentDir>/checkpoints", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "ckpt-agent-"));
		dirs.push(agentDir);
		const checkpointRoot = join(agentDir, "logged-out", "checkpoints");
		const store = new FileCheckpointStore({ checkpointRoot });
		await store.append(checkpoint());
		const text = await readFile(checkpointMainlinePath(checkpointRoot, "home"), "utf8");
		expect(text).toContain('"id":"cp_1"');
		await expect(readFile(join(agentDir, "checkpoints", "home", "mainline.jsonl"), "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("isolates records when the checkpoint root changes", async () => {
		const agentDir = await mkdtemp(join(tmpdir(), "ckpt-agent-"));
		dirs.push(agentDir);
		let root = join(agentDir, "logged-out", "checkpoints");
		const store = new FileCheckpointStore({ checkpointRoot: () => root });
		await store.append(checkpoint({ id: "logged-out-cp" }));
		root = join(agentDir, "accounts", "aaa", "checkpoints");
		await store.append(checkpoint({ id: "signed-in-cp" }));
		expect((await store.list("home")).map((record) => record.id)).toEqual(["signed-in-cp"]);
		root = join(agentDir, "logged-out", "checkpoints");
		expect((await store.list("home")).map((record) => record.id)).toEqual(["logged-out-cp"]);
	});
});
