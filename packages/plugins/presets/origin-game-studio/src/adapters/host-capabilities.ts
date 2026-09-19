/**
 * Adapter seams for platform capabilities that parallel threads own.
 *
 * Recording / Evaluation / Checkpoint are not in plugin-sdk yet. Game Studio
 * talks to them only through these typed ports so the rest of the plugin does
 * not grow `as any` once the host lands the real APIs.
 */

import type { PluginContext } from "@vetta-org/plugin-sdk";
import type { EvaluationDefinition } from "../milestones/definitions";

export interface EvaluationRunRequest {
	definitionId: string;
	trigger: { kind: "turn" | "checkpoint" | "milestone" | "manual"; ref?: string };
}

export interface EvaluationHost {
	run(request: EvaluationRunRequest): Promise<{ attemptId: string; outcome: string }>;
	upsertDefinition(definition: EvaluationDefinition): Promise<void>;
}

export interface CheckpointHost {
	list(projectKey: string): Promise<Array<{ id: string; turnId: string }>>;
	requestRevert(checkpointId: string): Promise<void>;
}

export interface RecordingHost {
	start(input: { url: string; projectKey: string }): Promise<{ recordingId: string }>;
	stop(recordingId: string): Promise<void>;
	sample(input: {
		recordingId: string;
		atMs?: number[];
		everyMs?: number;
		contactSheet?: boolean;
	}): Promise<{ frames: Array<{ atMs: number; path: string }> }>;
}

export interface GameStudioHostCapabilities {
	evaluation: EvaluationHost | null;
	checkpoints: CheckpointHost | null;
	recording: RecordingHost | null;
}

interface CapabilityBag {
	evaluation?: EvaluationHost;
	checkpoints?: CheckpointHost;
	recording?: RecordingHost;
}

export function readHostCapabilities(ctx: PluginContext): GameStudioHostCapabilities {
	const bag = ctx as PluginContext & CapabilityBag;
	return {
		evaluation: bag.evaluation ?? null,
		checkpoints: bag.checkpoints ?? null,
		recording: bag.recording ?? null,
	};
}

export async function upsertDefinitionsOnHost(
	ctx: PluginContext,
	definitions: EvaluationDefinition[],
): Promise<{ persisted: number; forwarded: boolean }> {
	const { evaluation } = readHostCapabilities(ctx);
	if (!evaluation) {
		return { persisted: definitions.length, forwarded: false };
	}
	for (const definition of definitions) {
		await evaluation.upsertDefinition(definition);
	}
	return { persisted: definitions.length, forwarded: true };
}
