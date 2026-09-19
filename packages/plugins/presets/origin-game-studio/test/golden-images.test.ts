import { afterEach, describe, expect, it, vi } from "vitest";
import { comparePngImages } from "../src/probe/image-diff";
import { loadProject, updateProject } from "../src/store/project-store";
import { executeGoldens } from "../src/tools/runtime";
import { createToolContext } from "./helpers/memory-host";

const png = (contents: string) => `data:image/png;base64,${btoa(contents)}`;

// jsdom has no bitmap decoder/canvas. Fake only those browser APIs; exercise real
// capture wiring, durable storage, decoding orchestration and pixel comparison.
function installCanvasBoundary() {
	vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
		const contents = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(reader.error);
			reader.readAsText(blob);
		});
		if (contents === "invalid") throw new Error("Invalid PNG");
		const data = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
		if (contents === "changed") data.set([201, 202, 203, 255], 4);
		return { width: contents === "wide" ? 4 : 2, height: 2, data, close() {} };
	});
	vi.stubGlobal(
		"OffscreenCanvas",
		class {
			getContext() {
				let image: ImageData;
				return {
					drawImage(value: ImageData) {
						image = value;
					},
					getImageData() {
						return image;
					},
				};
			}
		},
	);
}

afterEach(() => vi.unstubAllGlobals());

describe("golden image evidence", () => {
	it("captures a baseline, compares actual pixels at both threshold boundaries and rejects missing bytes", async () => {
		installCanvasBoundary();
		let frame = png("baseline");
		const { ctx, storage } = createToolContext({
			capture: {
				async offscreen() {
					return { dataUrl: frame, scaleFactor: 1 };
				},
				async releaseOffscreen() {},
			},
		});
		const session = { cwd: "/tmp/game", id: "s1" };
		await updateProject(storage, session.cwd, (project) => {
			project.stage.url = "http://localhost:5173/";
		});
		await executeGoldens(ctx, session, "record_golden", { name: "../start" });
		const golden = (await loadProject(storage, session.cwd)).goldens[0]!;
		expect(golden.artifact).not.toContain("..");
		expect(await storage.readFile(golden.artifact)).toBe(btoa("baseline"));
		expect(await executeGoldens(ctx, session, "check_golden", { name: "../start" })).toMatchObject({
			passed: true,
			diffRatio: 0,
		});
		frame = png("changed");
		expect(
			await executeGoldens(ctx, session, "check_golden", { name: "../start", max_diff_ratio: 0.249 }),
		).toMatchObject({ passed: false, diffRatio: 0.25 });
		expect(
			await executeGoldens(ctx, session, "check_golden", { name: "../start", max_diff_ratio: 0.25 }),
		).toMatchObject({ passed: true, diffRatio: 0.25 });
		storage.files.delete(golden.artifact);
		await expect(executeGoldens(ctx, session, "check_golden", { name: "../start" })).rejects.toThrow("has no image");
	});

	it("does not pass corrupt captures or silently compare different dimensions", async () => {
		installCanvasBoundary();
		await expect(comparePngImages(png("baseline"), png("invalid"))).rejects.toThrow("Invalid PNG");
		await expect(comparePngImages(png("baseline"), png("wide"))).rejects.toThrow("dimensions");
		await expect(comparePngImages("", png("baseline"))).rejects.toThrow("PNG data URL");
	});
});
