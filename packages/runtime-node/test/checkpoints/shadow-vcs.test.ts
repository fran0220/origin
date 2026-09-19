import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeWorkTreeVcs } from "../../src/checkpoints/shadow-vcs.js";

const dirs: string[] = [];

afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), prefix));
	dirs.push(dir);
	return dir;
}

describe("shadow git checkpoints", () => {
	it("lands, restores, and never rewrites history", async () => {
		const cwd = await tempDir("ckpt-work-");
		const agentDir = await tempDir("ckpt-agent-");
		await writeFile(join(cwd, "README.md"), "one\n", "utf8");
		const vcs = createNodeWorkTreeVcs({ checkpointRoot: join(agentDir, "checkpoints") });

		const first = await vcs.land({
			cwd,
			projectKey: "demo",
			operationId: "turn:s1:t1",
			intent: "first turn",
			mode: "shadow",
		});
		expect(first.paths).toContain("README.md");
		await writeFile(join(cwd, "README.md"), "two\n", "utf8");
		const second = await vcs.land({
			cwd,
			projectKey: "demo",
			operationId: "turn:s1:t2",
			intent: "second turn",
			mode: "shadow",
		});
		expect(second.parent).toBe(first.commit);

		const restored = await vcs.restore({
			cwd,
			projectKey: "demo",
			operationId: "op-revert-1",
			commit: second.commit,
			mode: "shadow",
		});
		expect(restored.commit).not.toBe(second.commit);
		expect(restored.parent).toBe(second.commit);
		expect(await readFile(join(cwd, "README.md"), "utf8")).toBe("one\n");

		const diff = await vcs.diff({
			cwd,
			projectKey: "demo",
			fromCommit: second.commit,
			toCommit: restored.commit,
			mode: "shadow",
		});
		expect(diff.paths).toContain("README.md");
	});
});
