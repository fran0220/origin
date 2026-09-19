import { createHash } from "node:crypto";

export function sha256Json(value: unknown): string {
	return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export function sha256Text(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function stableSerialize(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
	const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
		left.localeCompare(right),
	);
	return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(",")}}`;
}
