import {
	type CheckpointEngine,
	type CheckpointPolicy,
	CheckpointReactor,
	HOME_PROJECT_KEY,
	type MainlineCheckpoint,
} from "@vetta/runtime-checkpoints";
import {
	createNodeVerificationRunner,
	createNodeWorkTreeVcs,
	FileCheckpointStore,
	registerExecutionReceiptSink,
} from "@vetta/runtime-node/checkpoints";
import { DEFAULT_CONVERSATION_CWD, readDesktopConfig } from "../config/desktop-config-store.js";
import { resolveAccountScopedDirForHost } from "../connections/account-directory.js";
import { getAppLogger } from "../logger.js";
import { checkpointProjectKeyForCwd, decodeProjectKey, HOME_CHECKPOINT_PROJECT_KEY } from "./project-key.js";

const log = getAppLogger("checkpoints");

export interface DesktopCheckpointService {
	engine(): CheckpointEngine;
	list(projectKey?: string): Promise<readonly MainlineCheckpoint[]>;
	get(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint | undefined>;
	revert(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint>;
	rerunVerification(projectKey: string, checkpointId: string): Promise<MainlineCheckpoint>;
	setPolicy(policy: CheckpointPolicy): Promise<CheckpointPolicy>;
	readPolicy(projectKey: string): Promise<CheckpointPolicy>;
	resolveProjectKey(cwd?: string): Promise<string>;
	recoverKnownProjects(): Promise<void>;
}

function checkpointRoot(): string {
	return resolveAccountScopedDirForHost("checkpoints");
}

export function createDesktopCheckpointService(): DesktopCheckpointService {
	const store = new FileCheckpointStore({ checkpointRoot });
	const vcs = createNodeWorkTreeVcs({ checkpointRoot });
	const runner = createNodeVerificationRunner();
	const recovered = new Set<string>();
	const engine = new CheckpointReactor({
		store,
		vcs,
		runner,
		cwdFor: async (projectKey) => {
			if (projectKey === HOME_CHECKPOINT_PROJECT_KEY || projectKey === HOME_PROJECT_KEY) {
				return DEFAULT_CONVERSATION_CWD;
			}
			return decodeProjectKey(projectKey) ?? DEFAULT_CONVERSATION_CWD;
		},
	});
	registerExecutionReceiptSink({
		async record(receipt) {
			const projectKey = await resolveProjectKey(receipt.cwd);
			await store.appendReceipt(projectKey, receipt);
		},
	});

	async function resolveProjectKey(cwd?: string): Promise<string> {
		const config = await readDesktopConfig();
		return checkpointProjectKeyForCwd(cwd, config.projects);
	}

	async function recoverKnownProjects(): Promise<void> {
		const config = await readDesktopConfig();
		const keys = [
			HOME_CHECKPOINT_PROJECT_KEY,
			...config.projects.map((project) => checkpointProjectKeyForCwd(project.path, config.projects)),
		];
		for (const projectKey of keys) {
			const recoverKey = `${checkpointRoot()}\0${projectKey}`;
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
			const config = await readDesktopConfig();
			const keys = [
				HOME_CHECKPOINT_PROJECT_KEY,
				...config.projects.map((project) => checkpointProjectKeyForCwd(project.path, config.projects)),
			];
			const records: MainlineCheckpoint[] = [];
			for (const key of keys) records.push(...(await engine.list(key)));
			return records.sort((left, right) => right.createdAt - left.createdAt);
		},
		get: (projectKey, checkpointId) => engine.get(projectKey, checkpointId),
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

export function initializeDesktopCheckpointService(): DesktopCheckpointService {
	if (desktopCheckpointService) return desktopCheckpointService;
	desktopCheckpointService = createDesktopCheckpointService();
	return desktopCheckpointService;
}

export function getDesktopCheckpointService(): DesktopCheckpointService {
	if (!desktopCheckpointService) throw new Error("Desktop checkpoint service is not initialized");
	return desktopCheckpointService;
}
