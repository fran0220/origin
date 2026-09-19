import { describe, expect, it, vi } from "vitest";
import { agentTargetKey } from "./target";
import { createNewSessionTargetStrategyRegistry } from "./target-strategy";

describe("new-session target strategy registry", () => {
	it("resolves ordinary conversation by default", async () => {
		const conversation = vi.fn(async () => undefined);
		const registry = createNewSessionTargetStrategyRegistry({
			conversationDispatch: conversation,
			agentDispatch: vi.fn(async () => undefined),
			agentKey: null,
		});
		await registry.resolve(null).dispatch();
		expect(conversation).toHaveBeenCalledOnce();
	});

	it("routes a selected agent to its own dispatch", async () => {
		const agent = vi.fn(async () => undefined);
		const registry = createNewSessionTargetStrategyRegistry({
			conversationDispatch: vi.fn(async () => undefined),
			agentDispatch: agent,
			agentKey: agentTargetKey("agent-1"),
		});
		await registry.resolve(agentTargetKey("agent-1")).dispatch();
		await expect(registry.resolve(agentTargetKey("missing")).dispatch()).rejects.toThrow(
			"Unknown new-session target",
		);
		expect(agent).toHaveBeenCalledOnce();
	});
});
