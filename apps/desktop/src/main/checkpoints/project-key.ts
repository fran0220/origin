import { DEFAULT_CONVERSATION_CWD } from "../config/desktop-config-store.js";
import { sameProjectPath } from "../projects/project-path.js";

export const HOME_CHECKPOINT_PROJECT_KEY = "home";

const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

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
	return Buffer.from(value, "utf8").toString("base64url");
}

/**
 * Reverse {@link encodeProjectKey}. `home` is not a path. Arbitrary strings that
 * Node would still Buffer-decode are rejected: the value must be canonical
 * base64url of an absolute path.
 */
export function decodeProjectKey(projectKey: string): string | undefined {
	if (projectKey === HOME_CHECKPOINT_PROJECT_KEY) return undefined;
	if (!BASE64URL.test(projectKey) || projectKey.length % 4 === 1) return undefined;
	let decoded: string;
	try {
		decoded = Buffer.from(projectKey, "base64url").toString("utf8");
	} catch {
		return undefined;
	}
	if (!decoded || encodeProjectKey(decoded) !== projectKey) return undefined;
	if (!ABSOLUTE_PATH.test(decoded)) return undefined;
	return decoded;
}

/**
 * Worktree for a stored checkpoint projectKey. Unreadable keys throw instead of
 * falling back to the conversation Home directory.
 */
export function checkpointCwdForProjectKey(projectKey: string, homeCwd: string = DEFAULT_CONVERSATION_CWD): string {
	if (projectKey === HOME_CHECKPOINT_PROJECT_KEY) return homeCwd;
	const cwd = decodeProjectKey(projectKey);
	if (!cwd) {
		throw new Error(`Cannot restore checkpoints for unreadable project key`);
	}
	return cwd;
}
