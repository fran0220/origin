import type { CheckpointEngine, CheckpointPolicy, ProposeCheckpointInput } from "@origin/runtime-checkpoints";

export interface CheckpointTurnHost {
	readonly engine: CheckpointEngine;
	readonly resolveContext: (input: { readonly sessionId: string; readonly cwd?: string }) => Promise<{
		readonly projectKey: string;
		readonly cwd: string;
		readonly policy: CheckpointPolicy;
	}>;
	readonly extractIntent?: (input: {
		readonly sessionId: string;
		readonly turnId: string;
	}) => Promise<string | undefined>;
}

export interface CheckpointTurnFeatureOptions {
	readonly host: CheckpointTurnHost;
}

export type { ProposeCheckpointInput };
