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

	it("shows a real empty recordings dock while recording capability is missing", () => {
		setPluginCtx({} as never);
		render(<RecordingsTab />);
		expect(screen.getByRole("status").textContent).toBe("recordings.waiting");
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
