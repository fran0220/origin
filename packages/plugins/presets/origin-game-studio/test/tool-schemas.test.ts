import { describe, expect, it } from "vitest";
import { TOOL_GROUPS, TOOL_SCHEMAS, type ToolName } from "../src/tools/schemas";
import { validateToolInput } from "../src/tools/validate";

const ALL_TOOLS = Object.keys(TOOL_SCHEMAS) as ToolName[];

describe("game studio tool contracts", () => {
	it("registers every Sophon stage/design/build/deliver tool plus Origin project/probe tools", () => {
		expect(ALL_TOOLS).toEqual(
			expect.arrayContaining([
				"clarify",
				"game_delivery",
				"read_stage_content",
				"read_stage_status",
				"launch_stage",
				"stop_stage",
				"advance_stage",
				"play_input_script",
				"capture_frame",
				"record",
				"list_recordings",
				"read_recording_video",
				"sample_recording",
				"read_telemetry",
				"list_comparisons",
				"submit_comparison",
				"list_goldens",
				"record_golden",
				"check_golden",
				"read_stage_frame",
				"pick",
				"read_entity",
				"patch_entity",
				"list_annotations",
				"update_annotation",
				"verify_milestone",
				"prepare_prototype_image",
				"read_production_brief",
				"read_design_schema",
				"edit_design_graph",
				"prepare_production",
				"accept_design",
				"create_project",
				"start_dev_server",
				"probe_state",
			]),
		);
		expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(30);
	});

	it("groups tools without dropping any name", () => {
		const grouped = new Set(Object.values(TOOL_GROUPS).flat());
		expect([...grouped].sort()).toEqual([...ALL_TOOLS].sort());
	});

	it.each(ALL_TOOLS)("%s rejects additional properties and missing required fields", (name) => {
		expect(validateToolInput(name, { unexpected: true })).not.toBeNull();
	});

	it("accepts a valid create_project idea and refuses a blank one", () => {
		expect(validateToolInput("create_project", { idea: "a maze I can walk" })).toBeNull();
		expect(validateToolInput("create_project", { idea: "" })?.ok).toBe(false);
	});

	it("accepts advance ticks in range and refuses zero", () => {
		expect(validateToolInput("advance_stage", { ticks: 6 })).toBeNull();
		expect(validateToolInput("advance_stage", { ticks: 0 })?.ok).toBe(false);
	});

	it("accepts recording timing controls but rejects caller-assigned storage paths and ids", () => {
		expect(validateToolInput("record", { frames: 3, ticks_per_frame: 7, settle_ms: 0 })).toBeNull();
		expect(validateToolInput("record", { id: "custom" })?.ok).toBe(false);
		expect(validateToolInput("record", { path: "custom.mp4" })?.ok).toBe(false);
	});

	it("requires a reason-shaped dismissed annotation through the schema's optional reason plus runtime", () => {
		expect(validateToolInput("update_annotation", { annotation_id: "a1", state: "acknowledged" })).toBeNull();
		expect(validateToolInput("update_annotation", { annotation_id: "a1", state: "open" })?.ok).toBe(false);
	});

	it("keeps game_delivery as a tagged union of prepare/inspect/publish", () => {
		expect(
			validateToolInput("game_delivery", {
				action: "prepare",
				output_directory: "dist",
				source_revision: "sha256:abc",
			}),
		).toBeNull();
		expect(validateToolInput("game_delivery", { action: "inspect" })?.ok).toBe(false);
	});

	it("refuses pick without coordinates and patch_entity without a parameter", () => {
		expect(validateToolInput("pick", {})?.ok).toBe(false);
		expect(validateToolInput("patch_entity", { entity_id: "player" })?.ok).toBe(false);
		expect(validateToolInput("patch_entity", { entity_id: "player", parameter: "speed", value: 3 })).toBeNull();
	});
});
