/**
 * Real Electron OSR recording through the preload IPC surface.
 * Encoding-only coverage lives in runtime-node unit tests; this proves the host window path.
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const fixtureDirectory = mkdtempSync(join(tmpdir(), "vetta-recording-e2e-"));
const fixturePath = join(fixtureDirectory, "index.html");
writeFileSync(
	fixturePath,
	`<!doctype html><html><body style="margin:0;background:#c00;width:100vw;height:100vh"></body></html>`,
);
const fixtureUrl = pathToFileURL(fixturePath).toString();

describe("Desktop webpage recording", () => {
	it("records a local file page through OSR, then samples frames", async () => {
		await browser.waitUntil(
			async () => browser.execute(() => Boolean(window.vetta?.recording)),
			{ timeout: 60_000, timeoutMsg: "window.vetta.recording was not exposed" },
		);

		const result = await browser.execute(
			async (pageUrl: string, cwd: string) => {
				const started = await window.vetta.recording.start({
					projectKey: "e2e",
					sessionId: "e2e",
					url: pageUrl,
					cwd,
					width: 320,
					height: 180,
					fps: 10,
					retention: "30m",
				});
				await new Promise((resolve) => setTimeout(resolve, 3_200));
				const stopped = await window.vetta.recording.stop(started.id);
				const sample =
					stopped.status === "ready"
						? await window.vetta.recording.sample({
								recordingId: started.id,
								atMs: [0, 1_000],
								contactSheet: { columns: 2 },
							})
						: undefined;
				await window.vetta.recording.clear(started.id).catch(() => undefined);
				return {
					status: stopped.status,
					durationMs: stopped.durationMs ?? 0,
					codec: stopped.video?.codec,
					mimeType: stopped.video?.mimeType,
					audio: stopped.audio,
					frameCount: sample?.frames.length ?? 0,
					error: stopped.error,
				};
			},
			fixtureUrl,
			fixtureDirectory,
		);

		expect(result.error ?? "").toBe("");
		expect(result.status).toBe("ready");
		expect(result.codec).toBe("h264");
		expect(result.mimeType).toBe("video/mp4");
		expect(result.audio).toBe("none");
		expect(result.durationMs).toBeGreaterThanOrEqual(2_500);
		expect(result.frameCount).toBeGreaterThanOrEqual(2);
	});
});
