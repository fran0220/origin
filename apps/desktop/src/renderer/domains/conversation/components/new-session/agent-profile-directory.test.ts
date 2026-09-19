// @vitest-environment jsdom

import type { AgentProfileDocument } from "@origin/agent-profile";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	cachedAgentProfileDocument,
	loadAgentProfileDocument,
	resetAgentProfileDirectoryForTest,
	subscribeAgentProfileDocument,
} from "./agent-profile-directory";

function document(revision: number): AgentProfileDocument {
	return { schemaVersion: 1, revision, agents: [] } as unknown as AgentProfileDocument;
}

function installApi(list: () => Promise<AgentProfileDocument>): { notifyChanged: () => void } {
	const listeners = new Set<() => void>();
	Object.defineProperty(window, "vetta", {
		configurable: true,
		value: {
			agentProfiles: {
				list,
				onChanged: (listener: () => void) => {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
			},
		},
	});
	return {
		notifyChanged: () => {
			for (const listener of [...listeners]) listener();
		},
	};
}

afterEach(() => resetAgentProfileDirectoryForTest());

describe("new session agent team directory", () => {
	it("refetches and republishes when the main process reapplies the plugin presets", async () => {
		let revision = 1;
		const list = vi.fn(async () => document(revision));
		const { notifyChanged } = installApi(list);
		const seen = vi.fn();
		subscribeAgentProfileDocument(seen);
		await loadAgentProfileDocument();
		expect(cachedAgentProfileDocument()?.revision).toBe(1);

		// 插件热重载不经过渲染进程：不听这条事件，新会话页会一直摆着上一版的阵容。
		revision = 2;
		notifyChanged();
		await vi.waitFor(() => expect(cachedAgentProfileDocument()?.revision).toBe(2));
		expect(seen).toHaveBeenCalledTimes(2);
	});
});
