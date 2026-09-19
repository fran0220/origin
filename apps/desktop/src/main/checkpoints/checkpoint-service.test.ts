import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExecutionReceipt, MainlineCheckpoint } from "@vetta/runtime-checkpoints";
import { createExecutionReceiptCollector, FileCheckpointStore } from "@vetta/runtime-node/checkpoints";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("../connections/account-directory.js", () => ({
	resolveAccountScopedDirForHost: () => {
		throw new Error("checkpoint tests must supply checkpointRoot");
	},
}));

const { createDesktopCheckpointService, resetDesktopCheckpointServiceForTests } = await import(
	"./checkpoint-service.js"
);
const { encodeProjectKey, HOME_CHECKPOINT_PROJECT_KEY } = await import("./project-key.js");

const dirs: string[] = [];

afterEach(async () => {
	resetDesktopCheckpointServiceForTests();
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	dirs.push(dir);
	return dir;
}

function checkpoint(overrides?: Partial<MainlineCheckpoint>): MainlineCheckpoint {
	return {
		recordType: "checkpoint.mainline",
		schemaVersion: 1,
		id: "cp_1",
		operationId: "turn:s:t1",
		projectKey: HOME_CHECKPOINT_PROJECT_KEY,
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

function receipt(overrides?: Partial<ExecutionReceipt>): ExecutionReceipt {
	return {
		recordType: "checkpoint.execution-receipt",
		schemaVersion: 1,
		executionId: "exec_1",
		sessionId: "s",
		turnId: "t1",
		command: "true",
		cwd: "/tmp/demo",
		startedAt: 1,
		endedAt: 2,
		outcome: { kind: "exited", code: 0 },
		...overrides,
	};
}

describe("DesktopCheckpointService receipts and recovery", () => {
	it("lists receipts from the live store so later writes remain visible", async () => {
		const root = await tempDir("ckpt-svc-receipts-");
		const demo = "/tmp/demo";
		const service = createDesktopCheckpointService({
			checkpointRoot: root,
			homeCwd: join(root, "home-work"),
			readProjects: async () => [{ path: demo }],
		});
		const projectKey = encodeProjectKey(demo);
		const collector = createExecutionReceiptCollector(() => 1);
		await collector.begin({ sessionId: "s", turnId: "t1", command: "true", cwd: demo }).settle({
			kind: "exited",
			code: 0,
		});
		expect((await service.listReceipts(projectKey)).map((item) => item.executionId)).toHaveLength(1);
		await collector.begin({ sessionId: "s", turnId: "t2", command: "true", cwd: demo }).settle({
			kind: "exited",
			code: 0,
		});
		expect((await service.listReceipts(projectKey)).map((item) => item.executionId)).toHaveLength(2);
		expect(await service.listReceipts(HOME_CHECKPOINT_PROJECT_KEY)).toEqual([]);
	});

	it("keeps receipts in the current account root when the partition changes", async () => {
		const agentDir = await tempDir("ckpt-svc-account-");
		let root = join(agentDir, "logged-out", "checkpoints");
		const service = createDesktopCheckpointService({
			checkpointRoot: () => root,
			homeCwd: join(agentDir, "home-work"),
			readProjects: async () => [],
		});
		await new FileCheckpointStore({ checkpointRoot: () => root }).appendReceipt(
			HOME_CHECKPOINT_PROJECT_KEY,
			receipt({ executionId: "logged-out-exec", cwd: join(agentDir, "home-work") }),
		);
		expect((await service.listReceipts(HOME_CHECKPOINT_PROJECT_KEY)).map((item) => item.executionId)).toEqual([
			"logged-out-exec",
		]);

		root = join(agentDir, "accounts", "alice", "checkpoints");
		await new FileCheckpointStore({ checkpointRoot: () => root }).appendReceipt(
			HOME_CHECKPOINT_PROJECT_KEY,
			receipt({ executionId: "alice-exec", cwd: join(agentDir, "home-work") }),
		);
		expect((await service.listReceipts(HOME_CHECKPOINT_PROJECT_KEY)).map((item) => item.executionId)).toEqual([
			"alice-exec",
		]);

		root = join(agentDir, "logged-out", "checkpoints");
		expect((await service.listReceipts(HOME_CHECKPOINT_PROJECT_KEY)).map((item) => item.executionId)).toEqual([
			"logged-out-exec",
		]);
	});

	it("recovers listed projects without writing unknown keys into Home", async () => {
		const work = await tempDir("ckpt-svc-work-");
		const homeWork = join(work, "home");
		const projectWork = join(work, "game");
		await mkdir(homeWork, { recursive: true });
		await mkdir(projectWork, { recursive: true });
		await writeFile(join(homeWork, "note.txt"), "home\n", "utf8");
		await writeFile(join(projectWork, "note.txt"), "game\n", "utf8");
		const root = await tempDir("ckpt-svc-recover-");
		const store = new FileCheckpointStore({ checkpointRoot: root });
		await store.append(checkpoint({ id: "home-cp" }));
		await store.append(
			checkpoint({
				id: "garbage-cp",
				projectKey: "not-a-path",
				operationId: "turn:s:garbage",
				turnId: "garbage",
				phase: "settled",
				decision: "kept",
				landed: { commit: "abc123", parent: null, paths: ["note.txt"], added: 1, removed: 0 },
			}),
		);
		const service = createDesktopCheckpointService({
			checkpointRoot: root,
			homeCwd: homeWork,
			readProjects: async () => [{ path: projectWork }],
		});
		await service.recoverKnownProjects();
		expect((await service.list(HOME_CHECKPOINT_PROJECT_KEY)).map((item) => item.id)).toEqual(["home-cp"]);
		expect(await service.list(encodeProjectKey(projectWork))).toEqual([]);
		await expect(service.revert("not-a-path", "garbage-cp")).rejects.toThrow(
			"Cannot restore checkpoints for unreadable project key",
		);
		expect(await readFile(join(homeWork, "note.txt"), "utf8")).toBe("home\n");
		expect(await readFile(join(projectWork, "note.txt"), "utf8")).toBe("game\n");
	});

	it("does not attach an unknown project to Home receipts", async () => {
		const root = await tempDir("ckpt-svc-unknown-");
		const store = new FileCheckpointStore({ checkpointRoot: root });
		await store.append(checkpoint({ id: "home-cp" }));
		await store.appendReceipt(HOME_CHECKPOINT_PROJECT_KEY, receipt({ executionId: "home-exec", cwd: "/tmp/home" }));
		const service = createDesktopCheckpointService({
			checkpointRoot: root,
			homeCwd: "/tmp/home",
			readProjects: async () => [],
		});
		expect((await service.list()).map((item) => item.id)).toEqual(["home-cp"]);
		expect((await service.listReceipts(HOME_CHECKPOINT_PROJECT_KEY)).map((item) => item.executionId)).toEqual([
			"home-exec",
		]);
		expect(await service.listReceipts(encodeProjectKey("/tmp/unknown-game"))).toEqual([]);
	});
});
