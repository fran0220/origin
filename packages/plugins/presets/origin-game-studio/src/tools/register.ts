import type { PluginContext } from "@origin-org/plugin-sdk";
import { SCOPE_USE } from "../ids";
import { TOOL_DESCRIPTIONS, TOOL_GROUPS, TOOL_SCHEMAS, type ToolName } from "./schemas";
import { validateToolInput } from "./validate";
import {
	ToolError,
	executeAcceptDesign,
	executeClarify,
	executeComparisons,
	executeCreateProject,
	executeDelivery,
	executeEditDesignGraph,
	executeGoldens,
	executeLaunchStage,
	executeListAnnotations,
	executePlayInputScript,
	executePrepareProduction,
	executeProbe,
	executeReadDesignSchema,
	executeReadProductionBrief,
	executeReadStageContent,
	executeReadStageStatus,
	executeRecording,
	executeStartDevServer,
	executeStopDevServer,
	executeUpdateAnnotation,
	executeVerifyMilestone,
	type ToolSession,
} from "./runtime";

const JSON_SCHEMAS: Record<ToolName, object> = Object.fromEntries(
	Object.entries(TOOL_SCHEMAS).map(([name, schema]) => [name, JSON.parse(JSON.stringify(schema)) as object]),
) as Record<ToolName, object>;

async function dispatch(ctx: PluginContext, session: ToolSession, name: ToolName, input: Record<string, unknown>) {
	switch (name) {
		case "create_project":
			return executeCreateProject(ctx, session, {
				name: typeof input.name === "string" ? input.name : undefined,
				idea: String(input.idea ?? ""),
				genre: typeof input.genre === "string" ? input.genre : undefined,
				substrate: input.substrate === "three" || input.substrate === "canvas2d" ? input.substrate : undefined,
				existing: input.existing === true,
			});
		case "start_dev_server":
			return executeStartDevServer(ctx, session);
		case "stop_dev_server":
		case "stop_stage":
			return executeStopDevServer(ctx, session);
		case "launch_stage":
			return executeLaunchStage(ctx, session);
		case "read_stage_status":
			return executeReadStageStatus(ctx, session);
		case "read_stage_content":
			return executeReadStageContent(ctx, session);
		case "probe_state":
			return executeProbe(ctx, session, "state");
		case "probe_tick":
			return executeProbe(ctx, session, "tick");
		case "probe_advance":
		case "advance_stage":
			return executeProbe(ctx, session, "advance", [Number(input.ticks ?? 1)]);
		case "pick":
			return executeProbe(ctx, session, "pick", [Number(input.x), Number(input.y)]);
		case "read_entity":
			return executeProbe(ctx, session, "read_entity", [String(input.entity_id ?? "")]);
		case "patch_entity":
			return executeProbe(ctx, session, "patch_entity", [
				String(input.entity_id ?? ""),
				String(input.parameter ?? ""),
				input.value,
			]);
		case "play_input_script":
			return executePlayInputScript(ctx, session, String(input.path ?? ""));
		case "capture_frame":
		case "read_stage_frame":
			return executeProbe(ctx, session, "state");
		case "clarify":
			return executeClarify(ctx, session, {
				message: String(input.message ?? ""),
				requested_schema: (input.requested_schema as Record<string, unknown>) ?? {},
			});
		case "read_design_schema":
			return executeReadDesignSchema();
		case "read_production_brief":
			return executeReadProductionBrief(ctx, session);
		case "edit_design_graph":
			return executeEditDesignGraph(ctx, session, {
				expected_revision: typeof input.expected_revision === "string" ? input.expected_revision : undefined,
				edit: input.edit as { action: "choose" | "reject" | "reopen" | "cut" | "restore"; node_id: string },
			});
		case "prepare_production":
			return executePrepareProduction(ctx, session, String(input.node_id ?? ""));
		case "prepare_prototype_image":
			return executePrepareProduction(ctx, session, String(input.node_id ?? ""));
		case "accept_design":
			return executeAcceptDesign(ctx, session, {
				pillars: String(input.pillars ?? ""),
				systems: String(input.systems ?? ""),
				levels: Array.isArray(input.levels) ? (input.levels as Array<{ nodeId: string; markdown: string }>) : [],
				milestones: String(input.milestones ?? ""),
				instructionsSummary: String(input.instructionsSummary ?? ""),
			});
		case "verify_milestone":
			return executeVerifyMilestone(ctx, session, {
				operation_id: String(input.operation_id ?? ""),
				milestone_id: String(input.milestone_id ?? ""),
				refuted: Number(input.refuted ?? 0),
				confirmed: Number(input.confirmed ?? 0),
			});
		case "list_annotations":
			return executeListAnnotations(ctx, session);
		case "update_annotation":
			return executeUpdateAnnotation(ctx, session, {
				annotation_id: String(input.annotation_id ?? ""),
				state: input.state as "acknowledged" | "resolved" | "dismissed",
				reason: typeof input.reason === "string" ? input.reason : undefined,
				before_artifact: typeof input.before_artifact === "string" ? input.before_artifact : undefined,
				after_artifact: typeof input.after_artifact === "string" ? input.after_artifact : undefined,
			});
		case "game_delivery":
			return executeDelivery(ctx, session, input);
		case "record":
		case "list_recordings":
		case "read_recording_video":
		case "sample_recording":
		case "read_telemetry":
			return executeRecording(ctx, session, name, input);
		case "list_comparisons":
		case "submit_comparison":
			return executeComparisons(ctx, session, name, input);
		case "list_goldens":
		case "record_golden":
		case "check_golden":
			return executeGoldens(ctx, session, name, input);
	}
}

export function registerGameStudioTools(ctx: PluginContext): void {
	const names = Object.keys(TOOL_SCHEMAS) as ToolName[];
	for (const name of names) {
		ctx.agent.registerTool<Record<string, unknown>>({
			id: `origin-game-studio.${name}`,
			name,
			label: `%tool.${name}%`,
			description: TOOL_DESCRIPTIONS[name],
			parameters: JSON_SCHEMAS[name],
			scope_use: SCOPE_USE,
			handler: async ({ session, trigger }) => {
				const invalid = validateToolInput(name, trigger.input);
				if (invalid) return invalid;
				try {
					return await dispatch(ctx, { cwd: session.cwd, id: session.id }, name, trigger.input);
				} catch (error) {
					const message = error instanceof ToolError ? error.message : error instanceof Error ? error.message : String(error);
					return { ok: false, error: message };
				}
			},
		});
	}
}

export function toolNamesInGroup(group: keyof typeof TOOL_GROUPS): readonly string[] {
	return TOOL_GROUPS[group];
}
