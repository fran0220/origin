import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCheckpointStore } from "@origin/runtime-node/checkpoints";
import { FileEvaluationStore } from "@origin/runtime-node/evaluation";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCapabilityProject } from "../projects/capability-project.js";
import {
	createDesktopEvaluationService,
	getDesktopEvaluationOperations,
	registerDesktopEvaluationEvidenceProvider,
} from "./desktop-evaluation-runtime.js";

const state = vi.hoisted(() => ({ root: "", account: "account-a", cwd: "/test/game" }));
vi.mock("../logger.js", () => ({
	getAppLogger: () => ({ warn: vi.fn() }),
}));
vi.mock("../connections/account-directory.js", () => ({
	resolveAccountScopedDirForHost: (kind: string) => join(state.root, state.account, kind),
}));
vi.mock("../config/desktop-config-store.js", () => ({
	DEFAULT_CONVERSATION_CWD: "/test/home",
	readDesktopConfig: async () => ({ projects: [{ path: state.cwd }], archivedProjects: [] }),
}));

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
	state.root = await mkdtemp(join(tmpdir(), "origin-desktop-evaluation-"));
	roots.push(state.root);
	state.account = "account-a";
}

describe("desktop evaluation composition", () => {
	it("reads freshly appended checkpoint receipts through the production host wiring", async () => {
		await setup();
		const project = resolveCapabilityProject(state.cwd, [{ path: state.cwd }]);
		const service = createDesktopEvaluationService();
		await service.upsertDefinition(project.evaluationScope, {
			id: "build",
			title: "Build",
			criteria: [{ id: "build", title: "Build", required: true }],
		});
		const checkpoints = new FileCheckpointStore({ checkpointRoot: join(state.root, state.account, "checkpoints") });
		await checkpoints.appendReceipt(project.checkpointProjectKey, {
			recordType: "checkpoint.execution-receipt",
			schemaVersion: 1,
			executionId: "exec-a",
			sessionId: "session-a",
			turnId: "turn-a",
			command: "bun run build",
			cwd: state.cwd,
			startedAt: 1_000,
			endedAt: 2_000,
			outcome: { kind: "exited", code: 0 },
		});
		const attempt = await service.run({
			scope: project.evaluationScope,
			definitionId: "build",
			trigger: { kind: "manual" },
		});
		const view = await service.get(project.evaluationScope, attempt.id);
		expect(view.evidence).toEqual([
			expect.objectContaining({ source: expect.objectContaining({ executionId: "exec-a" }) }),
		]);
	});

	it("pins an in-flight attempt to its original account when the active account changes", async () => {
		await setup();
		const scope = { kind: "global" } as const;
		const first = createDesktopEvaluationService();
		const agentOperations = getDesktopEvaluationOperations();
		await first.upsertDefinition(scope, {
			id: "build",
			title: "Build",
			criteria: [{ id: "build", title: "Build", required: true }],
		});
		let enterCapture!: () => void;
		let releaseCapture!: () => void;
		const entered = new Promise<void>((resolve) => {
			enterCapture = resolve;
		});
		const released = new Promise<void>((resolve) => {
			releaseCapture = resolve;
		});
		const dispose = registerDesktopEvaluationEvidenceProvider({
			kind: "test-plugin",
			async capture() {
				enterCapture();
				await released;
				return { evidence: [] };
			},
		});
		try {
			const pending = first.run({ scope, definitionId: "build", trigger: { kind: "manual" } });
			await entered;
			state.account = "account-b";
			const second = createDesktopEvaluationService();
			expect(second).not.toBe(first);
			releaseCapture();
			expect((await pending).outcome.kind).toBe("cancelled");
			expect(await second.listDefinitions(scope)).toEqual([]);
			expect(await second.listAttempts(scope)).toEqual([]);
			expect(await agentOperations.listDefinitions(scope)).toEqual([]);
			await second.upsertDefinition(scope, {
				id: "account-b-definition",
				title: "Account B",
				criteria: [{ title: "Build B", required: true }],
			});
			expect((await agentOperations.listDefinitions(scope)).map((item) => item.id)).toEqual([
				"account-b-definition",
			]);
			const oldLedger = new FileEvaluationStore({ rootDir: join(state.root, "account-a", "evaluation") });
			expect(await oldLedger.listAttempts(scope)).toHaveLength(1);
		} finally {
			releaseCapture();
			dispose();
		}
	});
});
