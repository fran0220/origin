import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class RuntimeChecksumError extends Error {
	readonly expected: string;
	readonly actual: string;
	readonly url: string;

	constructor(url: string, expected: string, actual: string) {
		super(`Runtime download checksum mismatch for ${url}: expected ${expected}, got ${actual}`);
		this.name = "RuntimeChecksumError";
		this.url = url;
		this.expected = expected;
		this.actual = actual;
	}
}

export async function sha256File(path: string): Promise<string> {
	const hash = createHash("sha256");
	await new Promise<void>((resolve, reject) => {
		const stream = createReadStream(path);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve());
	});
	return hash.digest("hex");
}

export function sha256Buffer(data: Uint8Array): string {
	return createHash("sha256").update(data).digest("hex");
}

export function assertSha256(actual: string, expected: string, url: string): void {
	if (actual.toLowerCase() !== expected.toLowerCase()) {
		throw new RuntimeChecksumError(url, expected.toLowerCase(), actual.toLowerCase());
	}
}

export interface DownloadVerifiedOptions {
	readonly url: string;
	readonly dest: string;
	readonly sha256: string;
	readonly fetchImpl?: typeof fetch;
	readonly timeoutMs?: number;
}

/**
 * Download a file, persist it, then refuse it unless the sha256 matches.
 * The destination is only considered valid after the checksum check succeeds.
 */
export async function downloadVerifiedFile(options: DownloadVerifiedOptions): Promise<void> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 180_000);
	try {
		const response = await fetchImpl(options.url, { signal: controller.signal, redirect: "follow" });
		if (!response.ok) throw new Error(`HTTP ${response.status} from ${options.url}`);
		const bytes = new Uint8Array(await response.arrayBuffer());
		assertSha256(sha256Buffer(bytes), options.sha256, options.url);
		await mkdir(dirname(options.dest), { recursive: true });
		await writeFile(options.dest, bytes);
	} finally {
		clearTimeout(timer);
	}
}
