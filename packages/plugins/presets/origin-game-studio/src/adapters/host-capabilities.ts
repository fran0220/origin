import type {
	PluginCheckpoint,
	PluginContext,
	PluginEvaluationAttempt,
	PluginEvaluationScope,
	PluginProjectIdentity,
	PluginRecordingRecord,
} from "@origin-org/plugin-sdk";
import type { EvaluationDefinition } from "../milestones/definitions";

export async function resolveProjectIdentity(ctx: PluginContext, cwd: string): Promise<PluginProjectIdentity> {
	return ctx.project.resolve(cwd);
}

export async function upsertDefinitionsOnHost(
	ctx: PluginContext,
	definitions: EvaluationDefinition[],
	scope: PluginEvaluationScope,
): Promise<{ persisted: number; forwarded: boolean }> {
	for (const definition of definitions) {
		await ctx.evaluation.upsertDefinition({
			scope,
			definition: {
				id: definition.id,
				title: definition.title,
				criteria: definition.criteria.map((criterion) => ({
					id: criterion.id,
					title: criterion.title,
					required: criterion.required,
					...(criterion.verifier ? { verifier: criterion.verifier } : {}),
				})),
			},
		});
	}
	return { persisted: definitions.length, forwarded: true };
}

export async function runMilestoneEvaluation(
	ctx: PluginContext,
	definitionId: string,
	scope: PluginEvaluationScope,
	ref?: string,
): Promise<PluginEvaluationAttempt> {
	return ctx.evaluation.run({
		definitionId,
		scope,
		trigger: { kind: "milestone", ...(ref ? { ref } : {}) },
	});
}

export async function listHostCheckpoints(ctx: PluginContext, projectKey: string): Promise<readonly PluginCheckpoint[]> {
	return ctx.checkpoints.list(projectKey);
}

export async function listHostRecordings(
	ctx: PluginContext,
	projectKey: string,
): Promise<readonly PluginRecordingRecord[]> {
	const recording = ctx.recording;
	if (!recording) return [];
	return recording.list({ projectKey });
}
