import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertSha256, downloadVerifiedFile, RuntimeChecksumError, sha256Buffer } from "./runtime-download.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
	await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("runtime download checksum", () => {
	it("accepts a matching sha256 and writes the file", async () => {
		const root = await mkdtemp(join(tmpdir(), "vetta-runtime-dl-"));
		temporaryRoots.push(root);
		const payload = new TextEncoder().encode("ffmpeg-static-fixture");
		const digest = sha256Buffer(payload);
		const dest = join(root, "ffmpeg.gz");
		await downloadVerifiedFile({
			url: "https://example.test/ffmpeg.gz",
			dest,
			sha256: digest,
			fetchImpl: async () => new Response(payload, { status: 200 }),
		});
		expect(await readFile(dest)).toEqual(Buffer.from(payload));
	});

	it("refuses a sha256 mismatch and does not keep the payload", async () => {
		const root = await mkdtemp(join(tmpdir(), "vetta-runtime-dl-"));
		temporaryRoots.push(root);
		const payload = new TextEncoder().encode("tampered");
		const dest = join(root, "ffmpeg.gz");
		await expect(
			downloadVerifiedFile({
				url: "https://example.test/ffmpeg.gz",
				dest,
				sha256: "0".repeat(64),
				fetchImpl: async () => new Response(payload, { status: 200 }),
			}),
		).rejects.toBeInstanceOf(RuntimeChecksumError);
		await expect(readFile(dest)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("assertSha256 is case-insensitive and names the URL", () => {
		expect(() => assertSha256("Ab", "ab", "https://example.test/a")).not.toThrow();
		try {
			assertSha256("aa", "bb", "https://example.test/a");
			throw new Error("expected checksum error");
		} catch (error) {
			expect(error).toBeInstanceOf(RuntimeChecksumError);
			expect((error as RuntimeChecksumError).url).toBe("https://example.test/a");
		}
	});
});
