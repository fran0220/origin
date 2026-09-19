import type { PluginFsApi } from "@origin-org/plugin-sdk";
import type { Substrate } from "../design/types";
import { writeTextFile } from "../fs-write";
import { joinPath } from "../paths";
import { SCAFFOLD_FILES } from "./embedded";

const SHARED_PREFIX = "shared/";

function shouldSkipScaffoldPath(relative: string): boolean {
	const name = relative.split("/").pop() ?? relative;
	return name === "bun.lock" || name === "package-lock.json" || name === "yarn.lock";
}

export function scaffoldEntries(substrate: Substrate): Array<{ relative: string; content: string }> {
	const overlayPrefix = `${substrate}/`;
	const entries: Array<{ relative: string; content: string }> = [];
	for (const [path, content] of Object.entries(SCAFFOLD_FILES)) {
		let relative: string | null = null;
		if (path.startsWith(SHARED_PREFIX)) {
			relative = path.slice(SHARED_PREFIX.length);
		} else if (path.startsWith(overlayPrefix)) {
			relative = path.slice(overlayPrefix.length);
		}
		if (relative === null || shouldSkipScaffoldPath(relative)) continue;
		entries.push({ relative, content });
	}
	return entries;
}

export function injectProjectName(relative: string, content: string, name: string): string {
	if (relative === "package.json") {
		return content.replace(/"name": "game"/, `"name": ${JSON.stringify(name)}`);
	}
	if (relative === "index.html") {
		return content.replace("<title>game</title>", `<title>${escapeHtml(name)}</title>`);
	}
	return content;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => {
		switch (char) {
			case "&":
				return "&amp;";
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case '"':
				return "&quot;";
			default:
				return "&#39;";
		}
	});
}

export function sanitizeProjectName(raw: string): string {
	const trimmed = raw.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
	const collapsed = trimmed.replace(/^-+|-+$/g, "");
	return collapsed.length > 0 ? collapsed.slice(0, 64) : "game";
}

export interface ScaffoldLanding {
	substrate: Substrate;
	name: string;
	written: string[];
	skipped: string[];
}

export async function landScaffold(
	fs: PluginFsApi,
	root: string,
	substrate: Substrate,
	name: string,
): Promise<ScaffoldLanding> {
	const projectName = sanitizeProjectName(name);
	const written: string[] = [];
	const skipped: string[] = [];
	for (const entry of scaffoldEntries(substrate)) {
		const target = joinPath(root, entry.relative);
		const existing = await fs.stat(target);
		if (existing) {
			skipped.push(entry.relative);
			continue;
		}
		await writeTextFile(fs, target, injectProjectName(entry.relative, entry.content, projectName));
		written.push(entry.relative);
	}
	return { substrate, name: projectName, written, skipped };
}

export async function emptyImplementation(fs: PluginFsApi, root: string): Promise<boolean> {
	const manifest = await fs.stat(joinPath(root, "package.json"));
	const src = await fs.stat(joinPath(root, "src"));
	return manifest === null && src === null;
}
