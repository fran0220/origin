import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileCheckpointStore } from "../../src/checkpoints/jsonl-store.js";
import {
	CheckpointProjectKeyCollisionError,
	checkpointProjectDir,
	longCheckpointProjectDirName,
	resolveCheckpointProjectDirName,
	sanitizeProjectKey,
	truncatedLegacyProjectKey,
} from "../../src/checkpoints/layout.js";

const dirs: string[] = [];

afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempRoot(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "ckpt-layout-"));
	dirs.push(dir);
	return dir;
}

function encodeCwd(cwd: string): string {
	return Buffer.from(cwd, "utf8").toString("base64url");
}

function longKeys(): { first: string; firstCwd: string; second: string; secondCwd: string } {
	const firstCwd = `/${"a".repeat(200)}`;
	const secondCwd = `/${"a".repeat(200)}b`;
	const first = encodeCwd(firstCwd);
	const second = encodeCwd(secondCwd);
	expect(truncatedLegacyProjectKey(first)).toBe(truncatedLegacyProjectKey(second));
	expect(first).not.toBe(second);
	return { first, firstCwd, second, secondCwd };
}

describe("checkpoint project directories", () => {
	it("keeps short keys and maps a blank key to home without clipping", () => {
		expect(sanitizeProjectKey("home")).toBe("home");
		expect(sanitizeProjectKey("  ")).toBe("home");
		expect(sanitizeProjectKey("abc/def")).toBe("abc_def");
		expect(sanitizeProjectKey("a".repeat(140)).length).toBe(140);
	});

	it("sends colliding long keys to distinct hashed directories", async () => {
		const root = await tempRoot();
		const { first, second } = longKeys();
		expect(resolveCheckpointProjectDirName(root, first)).toBe(longCheckpointProjectDirName(first));
		expect(resolveCheckpointProjectDirName(root, second)).toBe(longCheckpointProjectDirName(second));
		expect(checkpointProjectDir(root, first)).not.toBe(checkpointProjectDir(root, second));
	});

	it("reuses a truncated leftover only when that directory exclusively belongs to the same projectKey", async () => {
		const root = await tempRoot();
		const { first, second } = longKeys();
		const legacyDir = join(root, truncatedLegacyProjectKey(first));
		await mkdir(legacyDir, { recursive: true });
		await writeFile(
			join(legacyDir, "mainline.jsonl"),
			`${JSON.stringify({ projectKey: first, id: "cp_owned" })}\n`,
			"utf8",
		);

		expect(resolveCheckpointProjectDirName(root, first)).toBe(truncatedLegacyProjectKey(first));
		expect(resolveCheckpointProjectDirName(root, second)).toBe(longCheckpointProjectDirName(second));
		expect(checkpointProjectDir(root, first)).not.toBe(checkpointProjectDir(root, second));
	});

	it("does not treat an unproven truncated leftover as compatible", async () => {
		const root = await tempRoot();
		const { first } = longKeys();
		const emptyDir = join(root, truncatedLegacyProjectKey(first));
		await mkdir(emptyDir, { recursive: true });
		expect(resolveCheckpointProjectDirName(root, first)).toBe(longCheckpointProjectDirName(first));

		await writeFile(join(emptyDir, "mainline.jsonl"), "{not-json}\n", "utf8");
		expect(resolveCheckpointProjectDirName(root, first)).toBe(longCheckpointProjectDirName(first));
	});

	it("reuses a truncated leftover when receipts encode to the same projectKey", async () => {
		const root = await tempRoot();
		const { first, firstCwd } = longKeys();
		const legacyDir = join(root, truncatedLegacyProjectKey(first));
		await mkdir(legacyDir, { recursive: true });
		await writeFile(
			join(legacyDir, "mainline.jsonl"),
			`${JSON.stringify({ projectKey: first, id: "cp_owned" })}\n`,
			"utf8",
		);
		await writeFile(
			join(legacyDir, "receipts.jsonl"),
			`${JSON.stringify({ executionId: "exec_owned", cwd: firstCwd })}\n`,
			"utf8",
		);
		expect(resolveCheckpointProjectDirName(root, first)).toBe(truncatedLegacyProjectKey(first));
	});

	it("refuses a truncated leftover whose receipts belong to another cwd", async () => {
		const root = await tempRoot();
		const { first, second, secondCwd } = longKeys();
		const legacyDir = join(root, truncatedLegacyProjectKey(first));
		await mkdir(legacyDir, { recursive: true });
		await writeFile(
			join(legacyDir, "mainline.jsonl"),
			`${JSON.stringify({ projectKey: first, id: "cp_owned" })}\n`,
			"utf8",
		);
		await writeFile(
			join(legacyDir, "receipts.jsonl"),
			`${JSON.stringify({ executionId: "exec_other", cwd: secondCwd })}\n`,
			"utf8",
		);
		expect(() => resolveCheckpointProjectDirName(root, first)).toThrow(CheckpointProjectKeyCollisionError);
		expect(() => resolveCheckpointProjectDirName(root, second)).toThrow(CheckpointProjectKeyCollisionError);
	});

	it("refuses mixed truncated leftovers instead of restoring either project into them", async () => {
		const root = await tempRoot();
		const { first, second } = longKeys();
		const legacyDir = join(root, truncatedLegacyProjectKey(first));
		await mkdir(legacyDir, { recursive: true });
		await writeFile(
			join(legacyDir, "mainline.jsonl"),
			`${JSON.stringify({ projectKey: first, id: "cp_a" })}\n${JSON.stringify({ projectKey: second, id: "cp_b" })}\n`,
			"utf8",
		);
		expect(() => resolveCheckpointProjectDirName(root, first)).toThrow(CheckpointProjectKeyCollisionError);
		expect(() => resolveCheckpointProjectDirName(root, second)).toThrow(CheckpointProjectKeyCollisionError);
	});

	it("keeps new hashed writes off a reused truncated directory", async () => {
		const root = await tempRoot();
		const { first, second } = longKeys();
		const store = new FileCheckpointStore({ checkpointRoot: root });
		const legacyDir = join(root, truncatedLegacyProjectKey(first));
		await mkdir(legacyDir, { recursive: true });
		await writeFile(
			join(legacyDir, "mainline.jsonl"),
			`${JSON.stringify({
				recordType: "checkpoint.mainline",
				schemaVersion: 1,
				id: "legacy-cp",
				operationId: "turn:s:legacy",
				projectKey: first,
				sessionId: "s",
				turnId: "legacy",
				intent: "Turn completed",
				createdAt: 1,
				updatedAt: 1,
				verification: [],
				phase: "settled",
				decision: "kept",
			})}\n`,
			"utf8",
		);

		expect((await store.list(first)).map((record) => record.id)).toEqual(["legacy-cp"]);
		await store.append({
			recordType: "checkpoint.mainline",
			schemaVersion: 1,
			id: "hashed-cp",
			operationId: "turn:s:hashed",
			projectKey: second,
			sessionId: "s",
			turnId: "hashed",
			intent: "Turn completed",
			createdAt: 2,
			updatedAt: 2,
			verification: [],
			phase: "settled",
			decision: "kept",
		});
		expect((await store.list(first)).map((record) => record.id)).toEqual(["legacy-cp"]);
		expect((await store.list(second)).map((record) => record.id)).toEqual(["hashed-cp"]);
		expect(checkpointProjectDir(root, second)).toBe(join(root, longCheckpointProjectDirName(second)));
	});
});
