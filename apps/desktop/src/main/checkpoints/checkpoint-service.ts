import {
	type CheckpointEngine,
	type CheckpointPolicy,
	CheckpointReactor,
	type ExecutionReceipt,
	HOME_PROJECT_KEY,
	type MainlineCheckpoint,
} from "@origin/runtime-checkpoints";
import {
	createNodeVerificationRunner,
	createNodeWorkTreeVcs,
	FileCheckpointStore,
	registerExecutionReceiptSink,
} from "@origin/runtime-node/checkpoints";
import { DEFAULT_CONVERSATION_CWD, readDesktopConfig } from "../config/desktop-config-store.js";
import { resolveAccountScopedDirForHost } from "../connections/account-directory.js";
import { getAppLogger } from "../logger.js";
import {
	checkpointCwdForProjectKey,
	checkpointProjectKeyForCwd,
	decodeProjectKey,
	HOME_CHECKPOINT_PROJECT_KEY,
} from "./project-key.js";

const log = getAppLogger("checkpoints");

export interface DesktopCheckpointServiceOptions {
	readonly checkpointRoot?: string | (() => string);
	readonly readProjects?: () => Promise<readonly { readonly path: string }[]>;
	readonly homeCwd?: string;
}

export interface DesktopCheckpointService {
	engine(): CheckpointEngine;
	list(projectKey?: string): Promise<readonly MainlineCheckpoint[]>;
	get(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint | undefined>;
	listReceipts(projectKey: string): Promise<readonly ExecutionReceipt[]>;
	revert(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint>;
	rerunVerification(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint>;
	setPolicy(policy: CheckpointPolicy): Promise<CheckpointPolicy>;
	readPolicy(projectKey: string): Promise<CheckpointPolicy>;
	resolveProjectKey(cwd?: string): Promise<string>;
	recoverKnownProjects(): Promise<void>;
}

function defaultCheckpointRoot(): string {
	return resolveAccountScopedDirForHost("checkpoints");
}

async function defaultReadProjects(): Promise<readonly { readonly path: string }[]> {
	const config = await readDesktopConfig();
	return [...config.projects, ...config.archivedProjects];
}

export function createDesktopCheckpointService(
	options: DesktopCheckpointServiceOptions = {},
): DesktopCheckpointService {
	const checkpointRoot = options.checkpointRoot ?? defaultCheckpointRoot;
	const homeCwd = options.homeCwd ?? DEFAULT_CONVERSATION_CWD;
	const readProjects = options.readProjects ?? defaultReadProjects;
	const store = new FileCheckpointStore({ checkpointRoot });
	const vcs = createNodeWorkTreeVcs({
		checkpointRoot: typeof checkpointRoot === "function" ? checkpointRoot : () => checkpointRoot,
	});
	const runner = createNodeVerificationRunner();
	const recovered = new Set<string>();
	const engine = new CheckpointReactor({
		store,
		vcs,
		runner,
		cwdFor: async (projectKey) => {
			if (projectKey === HOME_CHECKPOINT_PROJECT_KEY || projectKey === HOME_PROJECT_KEY) {
				return homeCwd;
			}
			return checkpointCwdForProjectKey(projectKey, homeCwd);
		},
	});
	unregisterReceiptSink?.();
	unregisterReceiptSink = registerExecutionReceiptSink({
		async record(receipt) {
			const projectKey = await resolveProjectKey(receipt.cwd);
			await store.appendReceipt(projectKey, receipt);
		},
	});

	async function resolveProjectKey(cwd?: string): Promise<string> {
		return checkpointProjectKeyForCwd(cwd, await readProjects());
	}

	async function listedProjectKeys(): Promise<string[]> {
		const projects = await readProjects();
		return [
			HOME_CHECKPOINT_PROJECT_KEY,
			...projects.map((project) => checkpointProjectKeyForCwd(project.path, projects)),
		];
	}

	async function recoverKnownProjects(): Promise<void> {
		const root = typeof checkpointRoot === "function" ? checkpointRoot() : checkpointRoot;
		for (const projectKey of await listedProjectKeys()) {
			if (projectKey !== HOME_CHECKPOINT_PROJECT_KEY && decodeProjectKey(projectKey) === undefined) {
				log.warn("skipping unreadable checkpoint project key", { projectKey });
				continue;
			}
			const recoverKey = `${root}\0${projectKey}`;
			if (recovered.has(recoverKey)) continue;
			recovered.add(recoverKey);
			try {
				await engine.recover(projectKey);
			} catch (error) {
				log.warn("failed to recover checkpoints", { projectKey, error });
			}
		}
	}

	return {
		engine: () => engine,
		list: async (projectKey) => {
			await recoverKnownProjects();
			if (projectKey) return engine.list(projectKey);
			const records: MainlineCheckpoint[] = [];
			for (const key of await listedProjectKeys()) records.push(...(await engine.list(key)));
			return records.sort((left, right) => right.createdAt - left.createdAt);
		},
		get: (projectKey, checkpointId) => engine.get(projectKey, checkpointId),
		listReceipts: (projectKey) => store.listReceipts(projectKey),
		revert: (projectKey, checkpointId) => engine.requestRevert(projectKey, checkpointId),
		rerunVerification: (projectKey, checkpointId) => engine.rerunVerification(projectKey, checkpointId),
		setPolicy: async (policy) => {
			await engine.setPolicy(policy);
			return engine.readPolicy(policy.projectKey);
		},
		readPolicy: (projectKey) => engine.readPolicy(projectKey),
		resolveProjectKey,
		recoverKnownProjects,
	};
}

let desktopCheckpointService: DesktopCheckpointService | undefined;
let unregisterReceiptSink: (() => void) | undefined;

export function initializeDesktopCheckpointService(
	options?: DesktopCheckpointServiceOptions,
): DesktopCheckpointService {
	if (desktopCheckpointService) return desktopCheckpointService;
	desktopCheckpointService = createDesktopCheckpointService(options);
	return desktopCheckpointService;
}

export function getDesktopCheckpointService(): DesktopCheckpointService {
	if (!desktopCheckpointService) throw new Error("Desktop checkpoint service is not initialized");
	return desktopCheckpointService;
}

export function resetDesktopCheckpointServiceForTests(): void {
	unregisterReceiptSink?.();
	unregisterReceiptSink = undefined;
	desktopCheckpointService = undefined;
}
