import type { ConversationEvent, PluginRecordingRecord } from "@vetta-org/plugin-sdk";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setPluginCtx } from "../src/plugin-context";
import { activeRecordingIdFor, callProbe } from "../src/probe/offscreen";
import { loadProject, updateProject } from "../src/store/project-store";
import { executeComparisons, executeRecording } from "../src/tools/runtime";
import { RecordingsTab } from "../src/ui/RecordingsTab";
import { createToolContext } from "./helpers/memory-host";

const session = { cwd: "/tmp/game", id: "session-1" };
const url = "http://127.0.0.1:5173/";
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function fixture() {
	const host = createToolContext();
	await updateProject(host.storage, session.cwd, (project) => {
		project.stage.url = url;
	});
	return host;
}

describe("recording lifecycle", () => {
	it("refreshes the mounted list after recording and honors frame count and settling", async () => {
		const { ctx, calls } = await fixture();
		let listener: (event: ConversationEvent) => void = () => {};
		ctx.conversation.on = (next) => {
			listener = next;
			return { dispose() {} };
		};
		setPluginCtx(ctx);
		render(<RecordingsTab />);
		act(() => listener({ type: "conversation-changed", conversation: { cwd: null } } as never));
		expect(screen.getByRole("status").textContent).toBe("recordings.empty");
		act(() => listener({ type: "conversation-changed", conversation: { cwd: session.cwd } } as never));
		await screen.findByRole("status");
		vi.useFakeTimers();
		const pending = executeRecording(ctx, session, "record", { frames: 3, ticks_per_frame: 7, settle_ms: 100 });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(299);
		});
		expect(calls.recordingStops).toEqual([]);
		expect(calls.recordingProbes.filter((item) => item.kind === "advance").map((item) => item.payload)).toEqual([
			7, 7, 7,
		]);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
			await pending;
		});
		vi.useRealTimers();
		expect(await screen.findByText("rec-1")).toBeTruthy();
		expect(calls.recordingStops).toEqual(["rec-1"]);
		expect(activeRecordingIdFor(url)).toBeUndefined();
	});

	it("preserves the probe failure when stopping also fails and releases the active mapping", async () => {
		const { ctx } = await fixture();
		vi.spyOn(ctx.recording!, "probe").mockImplementation(async (_id, kind) =>
			kind === "input" ? { ok: false, error: "input denied" } : { ok: true, result: 1 },
		);
		vi.spyOn(ctx.recording!, "stop").mockRejectedValue(new Error("encoder stop failed"));
		await expect(executeRecording(ctx, session, "record", {})).rejects.toThrow("input denied");
		expect(activeRecordingIdFor(url)).toBeUndefined();
		vi.spyOn(ctx.recording!, "probe").mockResolvedValue({ ok: true, result: true });
		await expect(executeRecording(ctx, session, "record", { settle_ms: 0 })).rejects.toThrow("encoder stop failed");
		expect(activeRecordingIdFor(url)).toBeUndefined();
	});

	it("uses the desktop patch payload for an active recording", async () => {
		const { ctx } = await fixture();
		const { rememberActiveRecording, forgetActiveRecording } = await import("../src/probe/offscreen");
		const probe = vi.spyOn(ctx.recording!, "probe");
		rememberActiveRecording(url, "rec-patch");
		try {
			await callProbe(ctx, url, "patch_entity", ["player", "speed", 3]);
			expect(probe).toHaveBeenCalledWith("rec-patch", "patch_entity", { id: "player", parameter: "speed", value: 3 });
		} finally {
			forgetActiveRecording(url);
		}
	});

	it("rejects unknown comparison checkpoints before persisting and accepts project checkpoints", async () => {
		const { ctx, storage, calls } = await fixture();
		const input = { before_artifact: "before.png", after_artifact: "after.png", before_checkpoint: "foreign-cp" };
		await expect(executeComparisons(ctx, session, "submit_comparison", input)).rejects.toThrow("does not belong");
		expect((await loadProject(storage, session.cwd)).comparisons).toEqual([]);
		await executeComparisons(ctx, session, "submit_comparison", { ...input, before_checkpoint: "cp-1" });
		expect((await loadProject(storage, session.cwd)).comparisons[0]?.beforeCheckpoint).toBe("cp-1");
		expect(calls.checkpointLists).toEqual(["checkpoint-key", "checkpoint-key"]);
	});

	it("ignores old-project responses and distinguishes a read error from an empty list", async () => {
		const { ctx } = await fixture();
		let listener: (event: ConversationEvent) => void = () => {};
		let finishOld: (records: PluginRecordingRecord[]) => void = () => {};
		ctx.conversation.on = (next) => {
			listener = next;
			return { dispose() {} };
		};
		const list = vi.spyOn(ctx.recording!, "list");
		list.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finishOld = resolve;
				}),
		);
		list.mockRejectedValueOnce(new Error("Cannot read recordings"));
		setPluginCtx(ctx);
		render(<RecordingsTab />);
		act(() => listener({ type: "conversation-changed", conversation: { cwd: "/old" } } as never));
		await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
		act(() => listener({ type: "conversation-changed", conversation: { cwd: "/new" } } as never));
		expect((await screen.findByRole("alert")).textContent).toBe("Cannot read recordings");
		expect(screen.queryByRole("status")).toBeNull();
		await act(async () => {
			finishOld([{ id: "stale" } as PluginRecordingRecord]);
		});
		expect(screen.queryByText("stale")).toBeNull();
		expect(screen.getByRole("alert")).toBeTruthy();
		act(() => listener({ type: "conversation-changed", conversation: { cwd: null } } as never));
		expect(screen.getByRole("status").textContent).toBe("recordings.empty");
	});
});
