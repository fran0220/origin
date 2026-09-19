import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const AGENT_TEAM_AGENTS_DIRECTORY = "agents";

export interface AgentTeamStorageIndex {
	readonly schemaVersion: 1;
	readonly revision: number;
	readonly agents: Readonly<Record<string, string>>;
}

/**
 * Build a stable, readable and cross-platform directory key.
 *
 * The display-name portion is only selected once. The immutable id digest keeps
 * equal names distinct without exposing UUID-shaped directories to users.
 */
export function createAgentTeamStorageKey(name: string, id: string): string {
	const words = name
		.normalize("NFKC")
		.match(/[\p{L}\p{N}]+/gu)
		?.join("-")
		.toLocaleLowerCase("en-US");
	const slug = truncateCodePoints(words || "resource", 48).replace(/[. ]+$/u, "") || "resource";
	const digest = createHash("sha256").update(id, "utf8").digest("hex").slice(0, 10);
	return `${slug}--${digest}`;
}

export function agentTeamAgentsRoot(root: string): string {
	return join(root, AGENT_TEAM_AGENTS_DIRECTORY);
}

export function agentDefinitionPath(root: string, directory: string): string {
	return join(agentTeamAgentsRoot(root), assertStorageDirectory(directory));
}

export function emptyAgentTeamStorageIndex(): AgentTeamStorageIndex {
	return { schemaVersion: 1, revision: 0, agents: {} };
}

export async function readAgentTeamStorageIndex(root: string): Promise<AgentTeamStorageIndex> {
	const value: unknown = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
	return parseStorageIndexValue(value);
}

export async function readOptionalAgentTeamStorageIndex(root: string): Promise<AgentTeamStorageIndex> {
	try {
		return await readAgentTeamStorageIndex(root);
	} catch (error) {
		if (isMissingFile(error)) return emptyAgentTeamStorageIndex();
		throw error;
	}
}

function parseStorageIndexValue(value: unknown): AgentTeamStorageIndex {
	if (!isRecord(value) || value.schemaVersion !== 1 || !isNonNegativeInteger(value.revision)) {
		throw new Error("Invalid Agent Profile storage index metadata");
	}
	return {
		schemaVersion: 1,
		revision: value.revision,
		agents: parseDirectoryMap(value.agents, "agent"),
	};
}

function parseDirectoryMap(value: unknown, label: string): Record<string, string> {
	if (!isRecord(value)) throw new Error(`Invalid Agent Profile ${label} directory map`);
	const result: Record<string, string> = {};
	const directories = new Set<string>();
	for (const [id, directory] of Object.entries(value)) {
		if (id.length === 0 || typeof directory !== "string") throw new Error(`Invalid Agent Profile ${label} directory`);
		assertStorageDirectory(directory);
		const normalized = directory.toLocaleLowerCase("en-US");
		if (directories.has(normalized)) throw new Error(`Duplicate Agent Profile ${label} directory: ${directory}`);
		directories.add(normalized);
		result[id] = directory;
	}
	return result;
}

function assertStorageDirectory(directory: string): string {
	if (
		directory.length === 0 ||
		directory === "." ||
		directory === ".." ||
		directory.includes("/") ||
		directory.includes("\\") ||
		directory.endsWith(".") ||
		directory.endsWith(" ")
	) {
		throw new Error(`Invalid Agent Profile storage directory: ${directory}`);
	}
	return directory;
}

function truncateCodePoints(value: string, maximum: number): string {
	return [...value].slice(0, maximum).join("");
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
	return isRecord(error) && error.code === "ENOENT";
}
