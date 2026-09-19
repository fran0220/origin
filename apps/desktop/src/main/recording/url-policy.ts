import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export function resolveRecordingTargetUrl(url: string, cwd?: string): string {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`Invalid recording url: ${url}`);
	}
	if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
	if (parsed.protocol !== "file:") {
		throw new Error(`Recording url must be http(s) or a project file: ${url}`);
	}
	if (!cwd) throw new Error("file: recording urls require a project cwd");
	const filePath = fileUrlToPath(parsed);
	if (!isPathInside(cwd, filePath)) {
		throw new Error("file: recording urls must stay inside the project cwd");
	}
	return pathToFileURL(resolve(filePath)).toString();
}

function fileUrlToPath(url: URL): string {
	if (process.platform === "win32") {
		return decodeURIComponent(url.pathname.replace(/^\//, "")).replace(/\//g, sep);
	}
	return decodeURIComponent(url.pathname);
}

function isPathInside(root: string, candidate: string): boolean {
	const resolvedRoot = resolve(root);
	const resolvedCandidate = resolve(candidate);
	if (resolvedCandidate === resolvedRoot) return true;
	const rel = relative(resolvedRoot, resolvedCandidate);
	return rel.length > 0 && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
