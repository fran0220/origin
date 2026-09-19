import { join } from "node:path";

/** Directory that already is the account-scoped `checkpoints` root. */
export function checkpointProjectDir(checkpointRoot: string, projectKey: string): string {
	return join(checkpointRoot, sanitizeProjectKey(projectKey));
}

export function checkpointMainlinePath(checkpointRoot: string, projectKey: string): string {
	return join(checkpointProjectDir(checkpointRoot, projectKey), "mainline.jsonl");
}

export function checkpointReceiptsPath(checkpointRoot: string, projectKey: string): string {
	return join(checkpointProjectDir(checkpointRoot, projectKey), "receipts.jsonl");
}

export function checkpointPolicyPath(checkpointRoot: string, projectKey: string): string {
	return join(checkpointProjectDir(checkpointRoot, projectKey), "policy.json");
}

export function checkpointShadowGitDir(checkpointRoot: string, projectKey: string): string {
	return join(checkpointProjectDir(checkpointRoot, projectKey), "shadow.git");
}

export function sanitizeProjectKey(projectKey: string): string {
	const trimmed = projectKey.trim();
	if (!trimmed) return "home";
	return trimmed.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 128);
}
