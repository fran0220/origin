import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FramePixels } from "@vetta/runtime-recording";
import { afterEach, describe, expect, it } from "vitest";
import { FfmpegFrameEncoder } from "./ffmpeg-frame-encoder.js";
import { contactSheetExpectedSize, resolveSampleTimestamps, sampleRecordingWithFfmpeg } from "./ffmpeg-sample.js";

const FFMPEG = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH ?? "ffprobe";

function ffmpegAvailable(): boolean {
	return spawnSync(FFMPEG, ["-version"], { encoding: "utf8" }).status === 0;
}

function solidFrame(atMs: number, width: number, height: number, color: [number, number, number, number]): FramePixels {
	const rgba = new Uint8Array(width * height * 4);
	for (let index = 0; index < width * height; index++) {
		rgba.set(color, index * 4);
	}
	return { atMs, width, height, rgba };
}

describe("FfmpegFrameEncoder", () => {
	const directories: string[] = [];

	afterEach(async () => {
		await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
	});

	it("encodes 3 seconds of fake RGBA frames into H.264 MP4 that ffprobe accepts", async () => {
		if (!ffmpegAvailable()) return;
		const directory = await mkdtemp(join(tmpdir(), "vetta-recording-"));
		directories.push(directory);
		const outputPath = join(directory, "video.mp4");
		const encoder = new FfmpegFrameEncoder({ ffmpegPath: FFMPEG });
		const width = 64;
		const height = 48;
		const fps = 10;
		const durationSeconds = 3;
		await encoder.start({ outputPath, width, height, fps, codec: "h264" });
		for (let index = 0; index < fps * durationSeconds; index++) {
			const result = await encoder.push(solidFrame(index * (1000 / fps), width, height, [255, 0, 0, 255]));
			expect(result.dropped).toBe(false);
		}
		const stats = await encoder.finish();
		expect(stats.acceptedFrames).toBe(fps * durationSeconds);
		expect(stats.sizeBytes).toBeGreaterThan(0);
		expect(stats.durationMs).toBeGreaterThanOrEqual(2_900);

		const probe = spawnSync(
			FFPROBE,
			[
				"-v",
				"error",
				"-show_entries",
				"format=format_name,duration:stream=codec_name,codec_type",
				"-of",
				"json",
				outputPath,
			],
			{ encoding: "utf8" },
		);
		expect(probe.status).toBe(0);
		const parsed = JSON.parse(probe.stdout) as {
			format?: { format_name?: string; duration?: string };
			streams?: Array<{ codec_name?: string; codec_type?: string }>;
		};
		expect(parsed.format?.format_name).toMatch(/mp4/);
		expect(parsed.streams?.some((stream) => stream.codec_type === "video" && stream.codec_name === "h264")).toBe(
			true,
		);
		expect(parsed.streams?.some((stream) => stream.codec_type === "audio" && stream.codec_name === "aac")).toBe(true);
		const duration = Number.parseFloat(parsed.format?.duration ?? "0");
		expect(duration).toBeGreaterThanOrEqual(2.8);
		expect(duration).toBeLessThan(4.5);

		const sample = await sampleRecordingWithFfmpeg({
			ffmpegPath: FFMPEG,
			videoPath: outputPath,
			outputDirectory: join(directory, "frames"),
			durationMs: Math.round(duration * 1000),
			request: { recordingId: "rec_test", atMs: [0, 1_000, 2_000], contactSheet: { columns: 3 } },
			width,
			height,
		});
		expect(sample.frames).toHaveLength(3);
		expect(sample.frames.map((frame) => frame.atMs)).toEqual([0, 1_000, 2_000]);
		expect(sample.contactSheetPath).toBeDefined();
		const identify = spawnSync(
			"ffprobe",
			[
				"-v",
				"error",
				"-select_streams",
				"v:0",
				"-show_entries",
				"stream=width,height",
				"-of",
				"csv=p=0",
				sample.contactSheetPath as string,
			],
			{
				encoding: "utf8",
			},
		);
		expect(identify.status).toBe(0);
		const [sheetWidth, sheetHeight] = identify.stdout.trim().split(",").map(Number);
		const expected = contactSheetExpectedSize(3, 3, width, height);
		expect(sheetWidth).toBe(expected.width);
		expect(sheetHeight).toBe(expected.height);
	}, 30_000);

	it("drops frames once the stdin queue is full", async () => {
		if (!ffmpegAvailable()) return;
		const directory = await mkdtemp(join(tmpdir(), "vetta-recording-drop-"));
		directories.push(directory);
		const encoder = new FfmpegFrameEncoder({ ffmpegPath: FFMPEG });
		const width = 320;
		const height = 240;
		await encoder.start({
			outputPath: join(directory, "video.mp4"),
			width,
			height,
			fps: 30,
			codec: "h264",
			maxQueuedFrames: 1,
		});
		const results = await Promise.all(
			Array.from({ length: 40 }, (_, index) => encoder.push(solidFrame(index, width, height, [0, 255, 0, 255]))),
		);
		const stats = await encoder.finish();
		expect(results.some((result) => result.dropped)).toBe(true);
		expect(stats.droppedFrames).toBeGreaterThan(0);
		expect(stats.acceptedFrames + stats.droppedFrames).toBe(40);
	}, 30_000);
});

describe("resolveSampleTimestamps", () => {
	it("uses explicit atMs and everyMs inclusive of duration", () => {
		expect(resolveSampleTimestamps({ recordingId: "r", atMs: [0, 500, 9_999] }, 1_000)).toEqual([0, 500, 1_000]);
		expect(resolveSampleTimestamps({ recordingId: "r", everyMs: 500 }, 1_000)).toEqual([0, 500, 1_000]);
	});
});
