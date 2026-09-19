// @vitest-environment jsdom

import type { AgentProfile } from "@origin/agent-profile";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AgentCenterModel } from "../hooks/useAgentCenterModel";
import { AgentCenterView } from "./AgentCenterView";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "zh" },
		t: (key: string, values?: Record<string, string | number>) =>
			values ? `${key}:${Object.values(values).join(":")}` : key,
	}),
}));
vi.mock("@origin-org/ui", () => ({
	Button: ({ children, variant: _variant, size: _size, ...props }: { children: ReactNode } & Record<string, unknown>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	Input: (props: Record<string, unknown>) => <input {...props} />,
	cn: (...values: readonly unknown[]) => values.filter(Boolean).join(" "),
}));
vi.mock("./AgentProfileSheet", () => ({ AgentProfileSheet: () => <div>sheet</div> }));

function agent(id: string): AgentProfile {
	return {
		id,
		revision: 1,
		name: id,
		description: `${id} description`,
		mentionHandle: id,
		blueprintId: "builder",
		abilities: { selectionMode: "custom" as const, skills: [], mcpServers: [], plugins: [] },
		scope: { kind: "library" },
		createdAt: 1,
		updatedAt: 1,
	};
}

function buildModel(overrides: Partial<AgentCenterModel> = {}): AgentCenterModel {
	const agents = [agent("alpha"), agent("beta")];
	return {
		loading: false,
		error: undefined,
		document: undefined,
		blueprints: [],
		plugins: [],
		capabilities: [],
		agents,
		findAgent: (agentId: string) => agents.find((item) => item.id === agentId),
		actions: {
			createAgent: vi.fn(),
			saveAgent: vi.fn(),
			deleteAgent: vi.fn(),
			createAgentFromDraft: vi.fn(),
		},
		...overrides,
	} as AgentCenterModel;
}

describe("AgentCenterView", () => {
	it("opens the profile drawer when a card is clicked", async () => {
		const onOpenAgent = vi.fn();
		const user = userEvent.setup();
		render(<AgentCenterView model={buildModel()} onOpenAgent={onOpenAgent} onCreateAgent={vi.fn()} />);

		await user.click(screen.getByRole("button", { name: "alpha" }));
		expect(onOpenAgent).toHaveBeenCalledWith("alpha");
	});

	it("creates a new agent from the library action", async () => {
		const onCreateAgent = vi.fn();
		const user = userEvent.setup();
		render(<AgentCenterView model={buildModel()} onOpenAgent={vi.fn()} onCreateAgent={onCreateAgent} />);

		await user.click(screen.getByRole("button", { name: "center.createAgent" }));
		expect(onCreateAgent).toHaveBeenCalledTimes(1);
	});
});
