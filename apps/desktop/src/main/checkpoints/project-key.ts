import { DEFAULT_CONVERSATION_CWD } from "../config/desktop-config-store.js";
import { sameProjectPath } from "../projects/project-path.js";

export const HOME_CHECKPOINT_PROJECT_KEY = "home";

export function checkpointProjectKeyForCwd(
	cwd: string | undefined,
	projects: readonly { readonly path: string }[],
): string {
	if (!cwd || sameProjectPath(cwd, DEFAULT_CONVERSATION_CWD)) return HOME_CHECKPOINT_PROJECT_KEY;
	const match = projects.find((project) => sameProjectPath(project.path, cwd));
	if (match) return encodeProjectKey(match.path);
	return encodeProjectKey(cwd);
}

export function encodeProjectKey(value: string): string {
	return Buffer.from(value).toString("base64url");
}

export function decodeProjectKey(projectKey: string): string | undefined {
	if (projectKey === HOME_CHECKPOINT_PROJECT_KEY) return undefined;
	try {
		return Buffer.from(projectKey, "base64url").toString("utf8");
	} catch {
		return undefined;
	}
}
