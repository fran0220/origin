import type { StoredSessionEvent, TurnObserver } from "@vetta/runtime-core/kernel";
import type { CheckpointTurnHost } from "./contracts.js";

const DEFAULT_INTENT = "Turn completed";

export function createCheckpointTurnObserver(host: CheckpointTurnHost): TurnObserver {
	return {
		id: "coding-agent.checkpoint",
		async observe(event: StoredSessionEvent, signal: AbortSignal): Promise<void> {
			if (event.type !== "turn.completed") return;
			signal.throwIfAborted();
			const context = await host.resolveContext({ sessionId: event.sessionId });
			const intent =
				(await host.extractIntent?.({ sessionId: event.sessionId, turnId: event.turnId })) ?? DEFAULT_INTENT;
			await host.engine.propose({
				projectKey: context.projectKey,
				sessionId: event.sessionId,
				turnId: event.turnId,
				intent,
				verificationCommands: context.policy.verificationCommands,
				cwd: context.cwd,
			});
		},
	};
}
