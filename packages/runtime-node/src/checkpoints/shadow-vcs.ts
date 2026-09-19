import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type {
	MainlineCommit,
	WorkTreeDiff,
	WorkTreeDiffInput,
	WorkTreeLandInput,
	WorkTreeRestoreInput,
	WorkTreeVcs,
} from "@vetta/runtime-checkpoints";
import { checkpointShadowGitDir } from "./layout.js";

const CHECKPOINT_TRAILER = "Vetta-Checkpoint";
const REVERT_TRAILER = "Vetta-Revert";
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const EXCLUDE_PATHS = [".vetta/", "node_modules/"];

export interface NodeWorkTreeVcsOptions {
	/** Account-scoped checkpoints root, e.g. `<agentDir>/logged-out/checkpoints`. */
	readonly checkpointRoot: string | (() => string);
	readonly gitCommand?: string;
}

export function createNodeWorkTreeVcs(options: NodeWorkTreeVcsOptions): WorkTreeVcs {
	const gitCommand = options.gitCommand ?? "git";
	const root = () =>
		typeof options.checkpointRoot === "function" ? options.checkpointRoot() : options.checkpointRoot;
	return {
		land: (input) => land(root(), gitCommand, input),
		restore: (input) => restore(root(), gitCommand, input),
		diff: (input) => diff(root(), gitCommand, input),
	};
}

async function land(checkpointRoot: string, gitCommand: string, input: WorkTreeLandInput): Promise<MainlineCommit> {
	const env = await gitEnv(checkpointRoot, gitCommand, input);
	const existing = await findOperation(gitCommand, env, CHECKPOINT_TRAILER, input.operationId);
	if (existing) return existing;
	await git(gitCommand, env, ["add", "-A", "--", "."]);
	const staged = await git(gitCommand, env, ["diff", "--cached", "--quiet", "--exit-code"], { allowCodes: [0, 1] });
	if (staged.code === 0) {
		const head = await currentCommit(gitCommand, env);
		if (head) return describeCommit(gitCommand, env, head);
		throw new Error("there are no changes to checkpoint");
	}
	const message = markedMessage(input.intent, CHECKPOINT_TRAILER, input.operationId);
	await git(gitCommand, env, ["commit", "--quiet", "-m", message, "--allow-empty-message"]);
	const commit = await currentCommit(gitCommand, env);
	if (!commit) throw new Error("git commit did not produce a checkpoint");
	return describeCommit(gitCommand, env, commit);
}

async function restore(
	checkpointRoot: string,
	gitCommand: string,
	input: WorkTreeRestoreInput,
): Promise<MainlineCommit> {
	const env = await gitEnv(checkpointRoot, gitCommand, input);
	const existing = await findOperation(gitCommand, env, REVERT_TRAILER, input.operationId);
	if (existing) return existing;
	const parent = await git(gitCommand, env, ["rev-parse", `${input.commit}^`], { allowCodes: [0, 128] });
	const restoreTarget = parent.code === 0 ? parent.stdout.trim() : EMPTY_TREE;
	await git(gitCommand, env, ["restore", "--source", restoreTarget, "--worktree", "--staged", "--", "."]);
	await git(gitCommand, env, ["clean", "-fd", "--exclude", ".vetta", "--exclude", "node_modules"]);
	await git(gitCommand, env, ["add", "-A", "--", "."]);
	const staged = await git(gitCommand, env, ["diff", "--cached", "--quiet", "--exit-code"], { allowCodes: [0, 1] });
	if (staged.code === 0) {
		const head = await currentCommit(gitCommand, env);
		if (head) return describeCommit(gitCommand, env, head);
	}
	const message = markedMessage(`Revert checkpoint ${input.commit}`, REVERT_TRAILER, input.operationId);
	await git(gitCommand, env, ["commit", "--quiet", "-m", message]);
	const commit = await currentCommit(gitCommand, env);
	if (!commit) throw new Error("git revert did not produce a checkpoint");
	return describeCommit(gitCommand, env, commit);
}

async function diff(checkpointRoot: string, gitCommand: string, input: WorkTreeDiffInput): Promise<WorkTreeDiff> {
	const env = await gitEnv(checkpointRoot, gitCommand, input);
	const range = input.toCommit ? [input.fromCommit, input.toCommit] : [input.fromCommit];
	const names = await git(gitCommand, env, ["diff", "--name-only", ...range], { allowCodes: [0, 1] });
	const stats = await git(gitCommand, env, ["diff", "--numstat", ...range], { allowCodes: [0, 1] });
	const patch = await git(gitCommand, env, ["diff", ...range], { allowCodes: [0, 1] });
	let added = 0;
	let removed = 0;
	for (const line of stats.stdout.split("\n")) {
		const match = /^(\d+|-)\t(\d+|-)\t/.exec(line);
		if (!match) continue;
		if (match[1] !== "-") added += Number(match[1]);
		if (match[2] !== "-") removed += Number(match[2]);
	}
	const paths = names.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((path) => relative(env.cwd, join(env.cwd, path)).replaceAll("\\", "/"));
	return {
		fromCommit: input.fromCommit,
		toCommit: input.toCommit ?? null,
		paths,
		added,
		removed,
		patch: patch.stdout,
	};
}

async function gitEnv(
	checkpointRoot: string,
	gitCommand: string,
	input: { readonly cwd: string; readonly projectKey: string; readonly mode: "shadow" | "project-mainline" },
): Promise<GitEnv> {
	const cwd = resolve(input.cwd);
	if (input.mode === "project-mainline") {
		await git(gitCommand, { cwd }, ["rev-parse", "--is-inside-work-tree"]);
		return { cwd };
	}
	const gitDir = checkpointShadowGitDir(checkpointRoot, input.projectKey);
	await mkdir(dirname(gitDir), { recursive: true });
	const initialized = await git(
		gitCommand,
		{ cwd, env: { GIT_DIR: gitDir, GIT_WORK_TREE: cwd } },
		["rev-parse", "--git-dir"],
		{
			allowCodes: [0, 128],
		},
	);
	if (initialized.code !== 0) {
		await git(gitCommand, { cwd }, ["init", "--bare", gitDir]);
		await mkdir(join(gitDir, "info"), { recursive: true });
		await writeFile(join(gitDir, "info", "exclude"), `${EXCLUDE_PATHS.join("\n")}\n`, "utf8");
		await git(gitCommand, { cwd, env: { GIT_DIR: gitDir, GIT_WORK_TREE: cwd } }, [
			"config",
			"user.email",
			"checkpoints@vetta.local",
		]);
		await git(gitCommand, { cwd, env: { GIT_DIR: gitDir, GIT_WORK_TREE: cwd } }, [
			"config",
			"user.name",
			"Vetta Checkpoints",
		]);
		await git(gitCommand, { cwd, env: { GIT_DIR: gitDir, GIT_WORK_TREE: cwd } }, [
			"config",
			"commit.gpgsign",
			"false",
		]);
	}
	return { cwd, env: { GIT_DIR: gitDir, GIT_WORK_TREE: cwd } };
}

async function currentCommit(gitCommand: string, env: GitEnv): Promise<string | undefined> {
	const result = await git(gitCommand, env, ["rev-parse", "HEAD"], { allowCodes: [0, 128] });
	if (result.code !== 0) return undefined;
	return result.stdout.trim() || undefined;
}

async function describeCommit(gitCommand: string, env: GitEnv, commit: string): Promise<MainlineCommit> {
	const parentResult = await git(gitCommand, env, ["rev-parse", `${commit}^`], { allowCodes: [0, 128] });
	const parent = parentResult.code === 0 ? parentResult.stdout.trim() : null;
	const names = await git(gitCommand, env, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit]);
	const stats = await git(gitCommand, env, ["diff-tree", "--root", "--numstat", "-r", commit]);
	let added = 0;
	let removed = 0;
	for (const line of stats.stdout.split("\n")) {
		const match = /^(\d+|-)\t(\d+|-)\t/.exec(line);
		if (!match) continue;
		if (match[1] !== "-") added += Number(match[1]);
		if (match[2] !== "-") removed += Number(match[2]);
	}
	const paths = names.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((path) => relative(env.cwd, join(env.cwd, path)).replaceAll("\\", "/"));
	return { commit, parent, paths, added, removed };
}

async function findOperation(
	gitCommand: string,
	env: GitEnv,
	trailer: string,
	operationId: string,
): Promise<MainlineCommit | undefined> {
	const result = await git(
		gitCommand,
		env,
		["log", "--all", "--format=%H", "--grep", `${trailer}: ${operationId}`, "-n", "1"],
		{ allowCodes: [0, 128] },
	);
	const commit = result.stdout.trim();
	if (!commit) return undefined;
	return describeCommit(gitCommand, env, commit);
}

function markedMessage(intent: string, trailer: string, operationId: string): string {
	return `${intent.trim()}\n\n${trailer}: ${operationId}\n`;
}

interface GitEnv {
	readonly cwd: string;
	readonly env?: NodeJS.ProcessEnv;
}

async function git(
	gitCommand: string,
	env: GitEnv,
	args: readonly string[],
	options: { readonly allowCodes?: readonly number[] } = {},
): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(gitCommand, ["-c", "commit.gpgsign=false", ...args], {
			cwd: env.cwd,
			env: { ...process.env, ...env.env },
			stdio: ["ignore", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.once("error", rejectPromise);
		child.once("close", (code) => {
			const result = {
				code: code ?? 1,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
			};
			if (options.allowCodes ? options.allowCodes.includes(result.code) : result.code === 0) {
				resolvePromise(result);
				return;
			}
			rejectPromise(new Error(`git ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`));
		});
	});
}
