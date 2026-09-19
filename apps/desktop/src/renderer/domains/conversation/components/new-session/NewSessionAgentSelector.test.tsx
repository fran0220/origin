// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type AgentProfile, createAgentProfileFixture } from "@origin/agent-profile";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewSessionAgentSelector } from "./NewSessionAgentSelector";
import { agentTargetKey, type NewSessionTargetKey } from "./target";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, number>) =>
			key === "newSession.agentSelector.memberCount" ? `${values?.count ?? 0} members` : key,
	}),
}));

afterEach(cleanup);

describe("NewSessionAgentSelector", () => {
	const document = createAgentProfileFixture();
	const agent = document.agents.find((candidate) => candidate.name === "Researcher");
	if (!agent) throw new Error("missing Agent Profile fixture");

	function mockCatalog(next = document): void {
		Object.defineProperty(window, "originApp", {
			configurable: true,
			value: { agentProfiles: { list: vi.fn(async () => next) } },
		});
	}

	beforeEach(() => mockCatalog());

	function Harness({ onSelect }: { onSelect: (key: NewSessionTargetKey | null) => void }): JSX.Element {
		const [selectedKey, setSelectedKey] = useState<NewSessionTargetKey | null>(null);
		return (
			<NewSessionAgentSelector
				selectedKey={selectedKey}
				onSelect={(targetKey) => {
					setSelectedKey(targetKey);
					onSelect(targetKey);
				}}
			/>
		);
	}

	it("picks a single agent and shows only that agent's avatar on the trigger", async () => {
		const onSelect = vi.fn();
		const user = userEvent.setup();
		render(<Harness onSelect={onSelect} />);

		await user.click(screen.getByRole("button", { name: "newSession.agentSelector.pickTitle" }));

		const option = await screen.findByRole("option", { name: new RegExp(agent.name) });
		await user.click(option);
		expect(onSelect).toHaveBeenCalledWith(agentTargetKey(agent.id));

		const selectedTrigger = screen.getByRole("button", { name: "newSession.agentSelector.switchTitle" });
		expect(within(selectedTrigger).getByText(agent.name)).toBeDefined();
		expect(selectedTrigger.querySelectorAll("img")).toHaveLength(1);
	});

	it("filters the agent list with one query and drops names that match nothing", async () => {
		const user = userEvent.setup();
		// 搜索框只在条目多到一定数量时出现，预置目录刚好卡在阈值上，故再添一个。
		const extra: AgentProfile = { ...agent, id: "extra-1", name: "Translate" };
		const filler: AgentProfile = { ...agent, id: "extra-2", name: "Filler" };
		mockCatalog({ ...document, agents: [...document.agents, extra, filler] });
		render(<Harness onSelect={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "newSession.agentSelector.pickTitle" }));
		await screen.findByRole("option", { name: new RegExp(agent.name) });
		await user.type(screen.getByPlaceholderText("newSession.agentSelector.searchPlaceholder"), extra.name);

		expect(screen.queryByRole("option", { name: new RegExp(agent.name) })).toBeNull();
		expect(screen.getByRole("option", { name: new RegExp(extra.name) })).toBeDefined();
	});

});
