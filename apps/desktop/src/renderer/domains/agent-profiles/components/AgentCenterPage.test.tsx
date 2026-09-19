// @vitest-environment jsdom

import { confirmDialogAtom } from "@shared/store/atoms";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentCenterPage } from "./AgentCenterPage";

const mocks = vi.hoisted(() => ({
	confirm: vi.fn(),
	deleteAgent: vi.fn(),
	navigate: vi.fn(),
	search: vi.fn(() => ({ agent: "agent" })),
	loading: false,
	error: undefined as string | undefined,
	hasDocument: true,
}));

const agent = {
	id: "agent",
	revision: 2,
	name: "Custom agent",
	description: "",
	mentionHandle: "internal-handle",
	blueprintId: "builder",
	abilities: { selectionMode: "custom" as const, skills: [], mcpServers: [], plugins: [] },
	scope: { kind: "library" },
	createdAt: 1,
	updatedAt: 1,
};

vi.mock("jotai", async (importOriginal) => ({
	...(await importOriginal<typeof import("jotai")>()),
	useSetAtom: (atom: unknown) => (atom === confirmDialogAtom ? mocks.confirm : vi.fn()),
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, string | number>) =>
			values ? `${key}:${Object.values(values).join(":")}` : key,
	}),
}));
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mocks.navigate,
	useSearch: () => mocks.search(),
}));
vi.mock("@shared/agent-profiles/team-session-events", () => ({
	notifyAgentProfileConfigurationChanged: vi.fn(),
}));
vi.mock("./AgentCenterView", () => ({
	AgentCenterView: () => <div>library</div>,
}));
vi.mock("./AgentProfileSheet", () => ({
	AgentProfileSheet: ({ onDelete }: { onDelete?: () => void }) => (
		<button type="button" onClick={onDelete}>
			delete-agent
		</button>
	),
}));
vi.mock("../hooks/useAgentCenterModel", () => ({
	useAgentCenterModel: () => ({
		loading: mocks.loading,
		error: mocks.error,
		document: mocks.hasDocument ? { schemaVersion: 1, revision: 1, agents: [agent] } : undefined,
		agents: [agent],
		findAgent: () => agent,
		blueprints: [],
		plugins: [],
		capabilities: [],
		actions: {
			deleteAgent: mocks.deleteAgent,
			saveAgent: vi.fn(),
			createAgentFromDraft: vi.fn(),
		},
	}),
}));

describe("AgentCenterPage", () => {
	afterEach(() => {
		mocks.loading = false;
		mocks.error = undefined;
		mocks.hasDocument = true;
		mocks.search.mockReturnValue({ agent: "agent" });
	});

	it("数据还在加载时仍画出页面，不把标题换成加载文案", () => {
		mocks.loading = true;
		render(<AgentCenterPage />);
		expect(screen.queryByText("loading")).toBeNull();
		expect(screen.getByText("library")).toBeTruthy();
	});

	it("配置加载失败时仍保留页标题", () => {
		mocks.hasDocument = false;
		mocks.error = "boom";
		render(<AgentCenterPage />);
		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("center.title");
		expect(screen.getByText("error.load:boom")).toBeTruthy();
	});

	it("deletes an agent after confirmation and returns to the library", async () => {
		mocks.deleteAgent.mockResolvedValue(true);
		const user = userEvent.setup();
		render(<AgentCenterPage />);

		await user.click(screen.getByRole("button", { name: "delete-agent" }));
		await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
		const confirmation = mocks.confirm.mock.calls.at(-1)?.[0];
		expect(confirmation.message).toContain("Custom agent");

		act(() => confirmation.onConfirm());
		await waitFor(() => expect(mocks.deleteAgent).toHaveBeenCalledWith(expect.objectContaining({ id: "agent" })));
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/agents", search: {} })),
		);
	});
});
