// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgentProfileFixture } from "@origin/agent-profile";
import { createElement, type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAgentProfileDirectoryForTest } from "./agent-profile-directory";
import { NewSessionAgentSelector } from "./NewSessionAgentSelector";
import { DefaultNewSessionHero } from "./NewSessionHero";
import type { NewSessionTargetKey } from "./target";
import { useNewSessionTargetIdentity } from "./useNewSessionTargetIdentity";

// hero 与选择器里的头像都挂着 motion；这里只关心 DOM 结构，动画一律退化成普通元素。
vi.mock("motion/react", () => ({
	AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
	motion: new Proxy(
		{},
		{
			get:
				(_target, tag: string) =>
				({ children, ...rest }: { children?: ReactNode }) =>
					createElement(tag, domProps(rest), children),
		},
	),
	useAnimation: () => ({ set: () => {}, start: async () => {}, stop: () => {} }),
	useReducedMotion: () => true,
}));

/** motion 专属 props 不能透传给 DOM，否则 React 会对每个未知属性告警。 */
function domProps(props: Record<string, unknown>): Record<string, unknown> {
	const motionOnly = new Set(["animate", "exit", "initial", "transition", "variants", "whileHover", "whileTap"]);
	return Object.fromEntries(Object.entries(props).filter(([key]) => !motionOnly.has(key)));
}
vi.mock("../GuideBadgeSwiper", () => ({ GuideBadgeSwiper: () => null }));
vi.mock("./ornament/HeroOrnamentSlot", () => ({ HeroOrnamentSlot: () => null }));
vi.mock("@origin-org/theme-sdk", () => ({ useThemeComponent: (_key: string, fallback: unknown) => fallback }));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, number>) =>
			key === "newSession.agentSelector.memberCount" ? `${values?.count ?? 0} members` : key,
	}),
}));

afterEach(cleanup);

/** 新会话页的真实接线：选择器改 target，hero 通过同一份名录解析出身份。 */
function Harness(): JSX.Element {
	const [targetKey, setTargetKey] = useState<NewSessionTargetKey | null>(null);
	const identity = useNewSessionTargetIdentity(targetKey);
	return (
		<>
			<NewSessionAgentSelector selectedKey={targetKey} onSelect={setTargetKey} />
			<DefaultNewSessionHero
				avatarAutoplay={false}
				greetingTitle="Hi, Ada"
				identity={identity}
				mounted
				onSceneClick={() => {}}
				sceneActions={{}}
				sceneLabels={{ installPrompt: "", next: "", previous: "" }}
				scenes={[]}
				selected={null}
				subtitle="今天想做点什么"
			/>
		</>
	);
}

describe("new session hero identity", () => {
	const document = createAgentProfileFixture();
	const agent = document.agents.find((candidate) => candidate.name === "Researcher");
	if (!agent) throw new Error("missing Agent Profile fixture");

	beforeEach(() => {
		resetAgentProfileDirectoryForTest();
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: { agentProfiles: { list: vi.fn(async () => document), onChanged: () => () => {} } },
		});
	});

	async function pick(name: string): Promise<void> {
		const user = userEvent.setup();
		await user.click(screen.getAllByRole("button")[0]!);
		await user.click(await screen.findByRole("option", { name: new RegExp(name) }));
	}

	it("greets the user until a target is picked", () => {
		render(<Harness />);

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hi, Ada");
		expect(screen.getByText("今天想做点什么")).toBeDefined();
	});

	it("shows the picked agent's name, description and avatar in place of the greeting", async () => {
		render(<Harness />);

		await pick(agent.name);

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(agent.name);
		expect(screen.getByText(agent.description)).toBeDefined();
		expect(window.document.querySelectorAll(".ns-hero-avatar-slot img")).toHaveLength(1);
	});

	it("keeps the avatars mounted while the slot collapses back to the greeting", async () => {
		render(<Harness />);

		await pick(agent.name);
		const user = userEvent.setup();
		await user.click(screen.getAllByRole("button")[0]!);
		await user.click(await screen.findByText("newSession.agentSelector.clear"));

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hi, Ada");
		const slot = window.document.querySelector(".ns-hero-avatar-slot");
		expect(slot?.getAttribute("data-visible")).toBe("false");
		// 收起是宽度过渡，头像必须还在，否则会先凭空消失再收一个空盒子。
		expect(slot?.querySelectorAll("img")).toHaveLength(1);
	});
});
