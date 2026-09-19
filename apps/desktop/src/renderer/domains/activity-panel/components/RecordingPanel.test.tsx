// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { RecordingRecord } from "@vetta/runtime-recording";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityPanelContextProvider } from "../registry/context";
import { RecordingPanel } from "./RecordingPanel";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

function readyRecord(id: string): RecordingRecord {
	return {
		recordType: "recording.record",
		schemaVersion: 1,
		id,
		projectKey: "home",
		sessionId: "desktop",
		startedAt: 1_000,
		endedAt: 6_000,
		durationMs: 5_000,
		audio: "none",
		frames: [],
		telemetryPath: "telemetry.jsonl",
		inputPath: "input.jsonl",
		retention: "2h",
		status: "ready",
		video: {
			path: "/tmp/recordings/home/rec_1/video.mp4",
			mimeType: "video/mp4",
			codec: "h264",
			width: 64,
			height: 48,
			fps: 10,
			sizeBytes: 128,
		},
	};
}

describe("RecordingPanel", () => {
	const recording = {
		list: vi.fn(),
		start: vi.fn(),
		stop: vi.fn(),
		sample: vi.fn(),
		clear: vi.fn(),
		cancel: vi.fn(),
		read: vi.fn(),
		probe: vi.fn(),
	};

	beforeEach(() => {
		recording.list.mockResolvedValue([]);
		recording.start.mockResolvedValue(readyRecord("rec_1"));
		recording.stop.mockResolvedValue(readyRecord("rec_1"));
		recording.sample.mockResolvedValue({
			recordingId: "rec_1",
			frames: [{ atMs: 0, path: "/tmp/recordings/home/rec_1/frames/a.png" }],
		});
		recording.clear.mockResolvedValue(undefined);
		window.vetta = { recording } as unknown as typeof window.vetta;
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("lists recordings, starts one from the panel, then samples frames", async () => {
		const first = readyRecord("rec_1");
		recording.list.mockResolvedValueOnce([]).mockResolvedValue([first]);
		render(
			<ActivityPanelContextProvider value={{ workspace: { id: "ws", cwd: "/tmp/project", runtimeIds: [] }, knowledgeHistory: false }}>
				<RecordingPanel />
			</ActivityPanelContextProvider>,
		);

		await waitFor(() => expect(recording.list).toHaveBeenCalled());
		expect(screen.getByText("empty")).toBeTruthy();

		fireEvent.click(screen.getByText("start"));
		await waitFor(() => expect(recording.start).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com", cwd: "/tmp/project" })));
		await waitFor(() => expect(screen.getByText(/rec_1/)).toBeTruthy());

		fireEvent.click(screen.getByText("sample"));
		await waitFor(() => expect(recording.sample).toHaveBeenCalledWith(expect.objectContaining({ recordingId: "rec_1" })));
		await waitFor(() => expect(screen.getByAltText("framePreview")).toBeTruthy());
	});
});
