import { createHash } from "node:crypto";
import {
	type EvaluationScope,
	GLOBAL_SCOPE_KEY,
	HOME_PROJECT_KEY,
	parseScopeKey,
	scopeKey,
} from "@vetta/runtime-evaluation";
import { encodeProjectKey, HOME_CHECKPOINT_PROJECT_KEY } from "../checkpoints/project-key.js";
import { DEFAULT_CONVERSATION_CWD, readDesktopConfig } from "../config/desktop-config-store.js";
import { sameProjectPath } from "./project-path.js";

export interface CapabilityProjectDescriptor {
	readonly cwd: string;
	readonly evaluationScope: EvaluationScope;
	readonly checkpointProjectKey: string;
	readonly recordingProjectKey: string;
}

export interface CapabilityProjectScopeLookup {
	readonly descriptor: CapabilityProjectDescriptor;
	readonly evaluationScopeKey: string;
	readonly checkpointProjectKeys: readonly string[];
	readonly recordingProjectKeys: readonly string[];
}

export interface CapabilityProjectKeySet {
	readonly checkpointProjectKeys: readonly string[];
	readonly recordingProjectKeys: readonly string[];
}

const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/;

export function resolveCapabilityProject(
	cwd: string,
	projects: readonly { readonly path: string }[],
	homeCwd: string = DEFAULT_CONVERSATION_CWD,
): CapabilityProjectDescriptor {
	if (!cwd || sameProjectPath(cwd, homeCwd)) {
		return homeDescriptor(homeCwd);
	}
	if (!ABSOLUTE_PATH.test(cwd)) {
		throw new Error("Capability project cwd must be an absolute path.");
	}
	const canonical = findRegisteredPath(cwd, projects) ?? cwd;
	if (sameProjectPath(canonical, homeCwd)) {
		return homeDescriptor(homeCwd);
	}
	const recordingProjectKey = evaluationHash16(canonical);
	return {
		cwd: canonical,
		evaluationScope: { kind: "project", projectKey: recordingProjectKey },
		checkpointProjectKey: encodeProjectKey(canonical),
		recordingProjectKey,
	};
}

export async function resolveDesktopCapabilityProject(
	cwd: string,
	readProjects: () => Promise<readonly { readonly path: string }[]> = listedDesktopProjects,
): Promise<CapabilityProjectDescriptor> {
	return resolveCapabilityProject(cwd, await readProjects());
}

export function lookupCapabilityProjectByEvaluationScopeKey(
	evaluationScopeKey: string,
	projects: readonly { readonly path: string }[],
	homeCwd: string = DEFAULT_CONVERSATION_CWD,
): CapabilityProjectScopeLookup | undefined {
	let scope: EvaluationScope;
	try {
		scope = parseScopeKey(evaluationScopeKey);
	} catch {
		return undefined;
	}
	if (scope.kind === "global") {
		const descriptor = homeDescriptor(homeCwd);
		return {
			descriptor,
			evaluationScopeKey: GLOBAL_SCOPE_KEY,
			checkpointProjectKeys: [HOME_CHECKPOINT_PROJECT_KEY],
			recordingProjectKeys: [HOME_PROJECT_KEY],
		};
	}
	if (scope.projectKey === HOME_PROJECT_KEY) {
		return undefined;
	}
	const matches = uniquePaths(
		projects.filter(
			(project) => !sameProjectPath(project.path, homeCwd) && pathHashes(project.path).includes(scope.projectKey),
		),
	);
	if (matches.length !== 1) return undefined;
	const descriptor = resolveCapabilityProject(matches[0], projects, homeCwd);
	if (descriptor.evaluationScope.kind === "global") return undefined;
	return {
		descriptor,
		evaluationScopeKey: scopeKey(descriptor.evaluationScope),
		checkpointProjectKeys: checkpointAliases(descriptor.cwd),
		recordingProjectKeys: recordingAliases(descriptor.cwd),
	};
}

export function resolveCapabilityProjectKeysForEvaluationScope(
	evaluationScopeKey: string,
	projects: readonly { readonly path: string }[],
	homeCwd: string = DEFAULT_CONVERSATION_CWD,
): CapabilityProjectKeySet | undefined {
	const lookup = lookupCapabilityProjectByEvaluationScopeKey(evaluationScopeKey, projects, homeCwd);
	if (!lookup) return undefined;
	return {
		checkpointProjectKeys: lookup.checkpointProjectKeys,
		recordingProjectKeys: lookup.recordingProjectKeys,
	};
}

export async function resolveDesktopCapabilityProjectKeysForEvaluationScope(
	evaluationScopeKey: string,
	readProjects: () => Promise<readonly { readonly path: string }[]> = listedDesktopProjects,
): Promise<CapabilityProjectKeySet | undefined> {
	return resolveCapabilityProjectKeysForEvaluationScope(evaluationScopeKey, await readProjects());
}

export async function lookupDesktopCapabilityProjectByEvaluationScopeKey(
	evaluationScopeKey: string,
	readProjects: () => Promise<readonly { readonly path: string }[]> = listedDesktopProjects,
): Promise<CapabilityProjectScopeLookup | undefined> {
	return lookupCapabilityProjectByEvaluationScopeKey(evaluationScopeKey, await readProjects());
}

function homeDescriptor(homeCwd: string): CapabilityProjectDescriptor {
	return {
		cwd: homeCwd,
		evaluationScope: { kind: "global" },
		checkpointProjectKey: HOME_CHECKPOINT_PROJECT_KEY,
		recordingProjectKey: HOME_PROJECT_KEY,
	};
}

async function listedDesktopProjects(): Promise<readonly { readonly path: string }[]> {
	const config = await readDesktopConfig();
	return [...config.projects, ...config.archivedProjects];
}

function findRegisteredPath(cwd: string, projects: readonly { readonly path: string }[]): string | undefined {
	return projects.find((project) => sameProjectPath(project.path, cwd))?.path;
}

function uniquePaths(projects: readonly { readonly path: string }[]): string[] {
	const paths: string[] = [];
	for (const project of projects) {
		if (paths.some((path) => sameProjectPath(path, project.path))) continue;
		paths.push(project.path);
	}
	return paths;
}

function pathAliases(path: string): readonly string[] {
	return uniqueStrings([path, normalizePathAlias(path), normalizePathAlias(path).toLowerCase()]);
}

function normalizePathAlias(path: string): string {
	const replaced = path.replace(/\\/g, "/");
	const stripped = replaced.replace(/\/+$/, "");
	if (stripped === "") return "/";
	if (/^[a-zA-Z]:$/.test(stripped)) return `${stripped}/`;
	return stripped;
}

function pathHashes(path: string): readonly string[] {
	return uniqueStrings(pathAliases(path).flatMap((alias) => [evaluationHash16(alias), gameStudioHash24(alias)]));
}

function checkpointAliases(path: string): readonly string[] {
	return uniqueStrings(pathAliases(path).map((alias) => encodeProjectKey(alias)));
}

function recordingAliases(path: string): readonly string[] {
	return uniqueStrings(pathAliases(path).flatMap((alias) => [evaluationHash16(alias), gameStudioHash24(alias)]));
}

function evaluationHash16(cwd: string): string {
	return sha256Hex(cwd).slice(0, 16);
}

function gameStudioHash24(cwd: string): string {
	return sha256Hex(cwd).slice(0, 24);
}

function sha256Hex(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values)];
}
