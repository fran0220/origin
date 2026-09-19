/** Map an absolute local path to the privileged origin-file:// scheme (ADR-0027). */
export function toOriginFileUrl(path: string): string {
	const normalized = path.replaceAll("\\", "/");
	const prefix = normalized.startsWith("/") ? "" : "/";
	return `origin-file://local${prefix}${encodeURI(normalized)}`;
}
