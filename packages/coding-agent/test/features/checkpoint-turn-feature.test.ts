import { describe, expect, it, vi } from "vitest";
import { createCheckpointTurnObserver } from "../../src/features/checkpoint/checkpoint-turn-feature.js";
import type { CheckpointTurnHost } from "../../src/features/checkpoint/contracts.js";

describe("CheckpointTurnFeature", () => {
	it("proposes a checkpoint after turn.completed", async () => {
		const propose = vi.fn();
		propose.mockResolvedValue({ created: true, checkpoint: { id: "cp_1" } });
		const host: CheckpointTurnHost = {
			engine: {
				propose: propose as CheckpointTurnHost["engine"]["propose"],
				requestRevert: vi.fn(),
				rerunVerification: vi.fn(),
				recover: vi.fn(),
				advance: vi.fn(),
				list: vi.fn(),
				get: vi.fn(),
				readPolicy: vi.fn(),
				setPolicy: vi.fn(),
			},
			resolveContext: async () => ({
				projectKey: "home",
				cwd: "/tmp/work",
				policy: {
					projectKey: "home",
					vcsMode: "shadow",
					verificationCommands: [],
					onVerificationFailure: "keep-for-user",
				},
			}),
		};
		const observer = createCheckpointTurnObserver(host);
		await observer.observe(
			{ type: "turn.completed", sessionId: "session-1", turnId: "turn-1", stopReason: "stop", timestamp: 1 },
			new AbortController().signal,
		);
		expect(propose).toHaveBeenCalledWith({
			projectKey: "home",
			sessionId: "session-1",
			turnId: "turn-1",
			intent: "Turn completed",
			verificationCommands: [],
			cwd: "/tmp/work",
		});
	});
});
