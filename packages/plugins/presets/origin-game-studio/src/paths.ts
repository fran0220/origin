export function joinPath(...parts: string[]): string {
	const raw = parts.filter((part) => part.length > 0).join("/");
	return raw.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export function basename(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const index = normalized.lastIndexOf("/");
	return index === -1 ? normalized : normalized.slice(index + 1);
}

export function dirname(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const index = normalized.lastIndexOf("/");
	return index <= 0 ? normalized : normalized.slice(0, index);
}

export function workspaceRelative(cwd: string, path: string): string {
	const normalizedCwd = cwd.replace(/\\/g, "/").replace(/\/$/, "");
	const normalizedPath = path.replace(/\\/g, "/");
	if (normalizedPath === normalizedCwd) return ".";
	if (normalizedPath.startsWith(`${normalizedCwd}/`)) {
		return normalizedPath.slice(normalizedCwd.length + 1);
	}
	return normalizedPath;
}
