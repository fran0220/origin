import type { PluginStorageApi } from "@vetta-org/plugin-sdk";
import { projectKey } from "../store/project-store";
import type { EvaluationDefinition } from "./definitions";

export function milestoneStorePath(cwd: string): string {
	return `milestones/${projectKey(cwd)}.json`;
}

export interface MilestoneLedger {
	cwd: string;
	definitions: EvaluationDefinition[];
	updatedAt: number;
}

export async function loadMilestoneLedger(
	storage: PluginStorageApi,
	cwd: string,
): Promise<MilestoneLedger> {
	const data = await storage.readFile(milestoneStorePath(cwd), "utf8");
	if (data === null) return { cwd, definitions: [], updatedAt: 0 };
	return JSON.parse(data) as MilestoneLedger;
}

export async function persistMilestoneDefinitions(
	storage: PluginStorageApi,
	cwd: string,
	definitions: EvaluationDefinition[],
): Promise<MilestoneLedger> {
	const ledger: MilestoneLedger = { cwd, definitions, updatedAt: Date.now() };
	await storage.writeFile(milestoneStorePath(cwd), JSON.stringify(ledger, null, 2), "utf8");
	return ledger;
}
