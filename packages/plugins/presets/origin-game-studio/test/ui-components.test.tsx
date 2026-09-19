// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewSessionContext } from "../src/ui/NewSessionContext";
import { RecordingsTab } from "../src/ui/RecordingsTab";
import { StageCard } from "../src/ui/StageCard";
import { setPluginCtx } from "../src/plugin-context";

describe("game studio UI", () => {
	afterEach(() => {
		cleanup();
	});

	it("lets the user pick a genre card and inserts the one-line idea into the composer", () => {
		const insertText = vi.fn();
		render(
			<NewSessionContext
				context={{
					target: { kind: "agent", id: "game-director", contributedId: "game-director" },
					mentionedAbilities: { skills: [], mcpServers: [] },
					draft: "a maze I can walk",
					cwd: "/tmp/game",
					composer: { attach() {}, insertText },
				}}
			/>,
		);
		expect(screen.getByText("newSession.ideaLabel")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /genre.puzzle-board/i }));
		expect(insertText).toHaveBeenCalledWith("newSession.prompt.genre", { position: "end" });
	});

	it("shows a real empty recordings list when the host has no recordings", () => {
		setPluginCtx({ recording: undefined } as never);
		render(<RecordingsTab />);
		expect(screen.getByRole("status").textContent).toBe("recordings.empty");
	});

	it("lists host recordings after the conversation binds a project cwd", async () => {
		const listeners: Array<(event: { type: string; conversation: { cwd: string } }) => void> = [];
		const list = vi.fn(async () => [
			{
				id: "rec-1",
				status: "ready",
				projectKey: "recording-key",
				sessionId: "s1",
				startedAt: 1,
				telemetryPath: "",
				inputPath: "",
				retention: "2h",
				audio: "none",
				frames: [],
			},
		]);
		setPluginCtx({
			recording: { list },
			conversation: {
				on(listener: (event: { type: string; conversation: { cwd: string } }) => void) {
					listeners.push(listener);
					return { dispose() {} };
				},
			},
			project: {
				async resolve() {
					return {
						cwd: "/tmp/game",
						evaluationScope: { kind: "project", projectKey: "eval-key" },
						checkpointProjectKey: "checkpoint-key",
						recordingProjectKey: "recording-key",
					};
				},
			},
		} as never);
		render(<RecordingsTab />);
		listeners[0]?.({ type: "conversation-changed", conversation: { cwd: "/tmp/game" } });
		expect(await screen.findByText("rec-1")).toBeTruthy();
		expect(screen.getByText("recordings.status")).toBeTruthy();
	});

	it("renders a stage card from the tool descriptor payload", () => {
		render(
			<StageCard
				pending={false}
				message={{ id: "m1", role: "assistant", text: "" }}
				descriptor={{ type: "origin-game-studio.stage", payload: { url: "http://127.0.0.1:5173/" } }}
			/>,
		);
		expect(screen.getByText("http://127.0.0.1:5173/")).toBeTruthy();
	});
});
