import { Type, type TSchema } from "@sinclair/typebox";

const Empty = Type.Object({}, { additionalProperties: false });
const NonBlank = Type.String({ minLength: 1 });
const Id = Type.String({ minLength: 1, maxLength: 128 });
const OperationId = Type.String({ minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9_-]+$" });

export const TOOL_SCHEMAS = {
	clarify: Type.Object(
		{
			message: NonBlank,
			requested_schema: Type.Object({}, { additionalProperties: true }),
		},
		{ additionalProperties: false },
	),
	game_delivery: Type.Union([
		Type.Object(
			{
				action: Type.Literal("prepare"),
				output_directory: NonBlank,
				source_revision: NonBlank,
				checkpoint_id: Type.Optional(Type.Union([NonBlank, Type.Null()])),
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("inspect"),
				archive_digest: NonBlank,
			},
			{ additionalProperties: false },
		),
		Type.Object(
			{
				action: Type.Literal("publish"),
				archive_digest: NonBlank,
				target: Type.Union([
					Type.Object({ kind: Type.Literal("create") }, { additionalProperties: false }),
					Type.Object(
						{ kind: Type.Literal("update"), game_id: NonBlank },
						{ additionalProperties: false },
					),
				]),
				listing: Type.Object(
					{
						title: NonBlank,
						description: NonBlank,
						engine: Type.Union([Type.Literal("html"), Type.Literal("threejs")]),
						max_players: Type.Integer({ minimum: 1, maximum: 16 }),
						cover: Type.Optional(Type.Union([NonBlank, Type.Null()])),
						poster: Type.Optional(Type.Union([NonBlank, Type.Null()])),
						changelog: Type.Optional(Type.Union([NonBlank, Type.Null()])),
					},
					{ additionalProperties: false },
				),
			},
			{ additionalProperties: false },
		),
	]),
	read_stage_content: Empty,
	read_stage_status: Empty,
	launch_stage: Empty,
	stop_stage: Empty,
	advance_stage: Type.Object(
		{ ticks: Type.Integer({ minimum: 1, maximum: 100_000 }) },
		{ additionalProperties: false },
	),
	play_input_script: Type.Object({ path: NonBlank }, { additionalProperties: false }),
	capture_frame: Type.Object(
		{ tick: Type.Optional(Type.Integer({ minimum: 0 })) },
		{ additionalProperties: false },
	),
	record: Type.Object(
		{
			frames: Type.Optional(Type.Integer({ minimum: 1, maximum: 600 })),
			ticks_per_frame: Type.Optional(Type.Integer({ minimum: 1, maximum: 100_000 })),
			settle_ms: Type.Optional(Type.Integer({ minimum: 0, maximum: 10_000 })),
		},
		{ additionalProperties: false },
	),
	list_recordings: Empty,
	read_recording_video: Type.Object({ recording_id: NonBlank }, { additionalProperties: false }),
	sample_recording: Type.Object(
		{
			recording_id: NonBlank,
			at_ms: Type.Optional(Type.Array(Type.Integer({ minimum: 0 }), { minItems: 1, maxItems: 32 })),
			every_ms: Type.Optional(Type.Integer({ minimum: 1 })),
			contact_sheet: Type.Optional(Type.Boolean()),
		},
		{ additionalProperties: false },
	),
	read_telemetry: Type.Object({ recording_id: NonBlank }, { additionalProperties: false }),
	list_comparisons: Empty,
	submit_comparison: Type.Object(
		{
			before_artifact: NonBlank,
			after_artifact: NonBlank,
			before_checkpoint: Type.Optional(NonBlank),
			after_checkpoint: Type.Optional(NonBlank),
			measured: Type.Optional(
				Type.Array(
					Type.Object(
						{
							name: NonBlank,
							before: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
							after: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
							unit: Type.Optional(NonBlank),
							note: Type.Optional(NonBlank),
						},
						{ additionalProperties: false },
					),
				),
			),
			note: Type.Optional(NonBlank),
		},
		{ additionalProperties: false },
	),
	list_goldens: Empty,
	record_golden: Type.Object({ name: NonBlank }, { additionalProperties: false }),
	check_golden: Type.Object(
		{
			name: NonBlank,
			max_diff_ratio: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
		},
		{ additionalProperties: false },
	),
	read_stage_frame: Empty,
	pick: Type.Object(
		{ x: Type.Number(), y: Type.Number() },
		{ additionalProperties: false },
	),
	read_entity: Type.Object({ entity_id: NonBlank }, { additionalProperties: false }),
	patch_entity: Type.Object(
		{
			entity_id: NonBlank,
			parameter: NonBlank,
			value: Type.Unknown(),
		},
		{ additionalProperties: false },
	),
	list_annotations: Empty,
	update_annotation: Type.Object(
		{
			annotation_id: NonBlank,
			state: Type.Union([Type.Literal("acknowledged"), Type.Literal("resolved"), Type.Literal("dismissed")]),
			reason: Type.Optional(NonBlank),
			before_artifact: Type.Optional(NonBlank),
			after_artifact: Type.Optional(NonBlank),
		},
		{ additionalProperties: false },
	),
	verify_milestone: Type.Object(
		{
			operation_id: OperationId,
			milestone_id: Id,
			refuted: Type.Integer({ minimum: 0 }),
			confirmed: Type.Integer({ minimum: 0 }),
		},
		{ additionalProperties: false },
	),
	prepare_prototype_image: Type.Object({ node_id: Id }, { additionalProperties: false }),
	read_production_brief: Empty,
	read_design_schema: Empty,
	edit_design_graph: Type.Object(
		{
			expected_revision: Type.Optional(NonBlank),
			edit: Type.Object(
				{
					action: Type.Union([
						Type.Literal("choose"),
						Type.Literal("reject"),
						Type.Literal("reopen"),
						Type.Literal("cut"),
						Type.Literal("restore"),
					]),
					node_id: NonBlank,
				},
				{ additionalProperties: false },
			),
		},
		{ additionalProperties: false },
	),
	prepare_production: Type.Object({ node_id: NonBlank }, { additionalProperties: false }),
	accept_design: Type.Object(
		{
			pillars: Type.String({ minLength: 1, maxLength: 262144 }),
			systems: Type.String({ minLength: 1, maxLength: 262144 }),
			levels: Type.Array(
				Type.Object(
					{
						nodeId: Id,
						markdown: Type.String({ minLength: 1, maxLength: 262144 }),
					},
					{ additionalProperties: false },
				),
				{ maxItems: 128 },
			),
			milestones: Type.String({ minLength: 1, maxLength: 262144 }),
			instructionsSummary: Type.String({ minLength: 1, maxLength: 32768 }),
		},
		{ additionalProperties: false },
	),
	create_project: Type.Object(
		{
			name: Type.Optional(NonBlank),
			idea: NonBlank,
			genre: Type.Optional(
				Type.Union([
					Type.Literal("platformer"),
					Type.Literal("top-down-action"),
					Type.Literal("first-person-exploration"),
					Type.Literal("racing"),
					Type.Literal("puzzle-board"),
					Type.Literal("card-deck"),
					Type.Literal("tower-defense"),
					Type.Literal("survival-crafting"),
				]),
			),
			substrate: Type.Optional(Type.Union([Type.Literal("canvas2d"), Type.Literal("three")])),
			existing: Type.Optional(Type.Boolean()),
		},
		{ additionalProperties: false },
	),
	start_dev_server: Empty,
	stop_dev_server: Empty,
	probe_state: Empty,
	probe_tick: Empty,
	probe_advance: Type.Object(
		{ ticks: Type.Integer({ minimum: 1, maximum: 100_000 }) },
		{ additionalProperties: false },
	),
} as const satisfies Record<string, TSchema>;

export type ToolName = keyof typeof TOOL_SCHEMAS;

export const TOOL_GROUPS = {
	stage: [
		"read_stage_content",
		"read_stage_status",
		"launch_stage",
		"stop_stage",
		"advance_stage",
		"play_input_script",
		"capture_frame",
		"read_stage_frame",
		"pick",
		"read_entity",
		"patch_entity",
		"list_annotations",
		"update_annotation",
		"start_dev_server",
		"stop_dev_server",
		"probe_state",
		"probe_tick",
		"probe_advance",
	],
	design: [
		"clarify",
		"create_project",
		"read_design_schema",
		"read_production_brief",
		"edit_design_graph",
		"prepare_production",
		"prepare_prototype_image",
		"accept_design",
	],
	build: [
		"verify_milestone",
		"list_comparisons",
		"submit_comparison",
		"list_goldens",
		"record_golden",
		"check_golden",
	],
	deliver: [
		"record",
		"list_recordings",
		"read_recording_video",
		"sample_recording",
		"read_telemetry",
		"game_delivery",
	],
} as const;

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
	clarify:
		"Ask a person a structured question through the Project conversation. requested_schema is an object schema with a required root recommended answer object, optional surface and blocked_nodes. Recommendations must answer every required field. Returns the person's accept/content, decline or cancel outcome; never assumes acceptance.",
	game_delivery:
		"Prepare or inspect an exact production archive, or explicitly publish that archive through the configured account. Design acceptance never publishes. Publication has external side effects; do not retry an uncertain publish result.",
	read_stage_content: "Read what this workspace declares about itself and the content symbols its source files define.",
	read_stage_status:
		"What the stage is right now: running or stale, the URL it is on, the readback contract the page exposes, and the last captured frame.",
	launch_stage:
		"Serve this workspace with the dev script its manifest declares and open it offscreen. Answers with the stage status once the server is listening.",
	stop_stage: "Stop the dev server and close the stage's page.",
	advance_stage:
		"Run the page a fixed number of steps against the injected clock. The tick is null when the page exposes no way to be stepped.",
	play_input_script:
		"Play one stored input script against the page. The script is named by its workspace-relative path under playtests/.",
	capture_frame:
		"Capture one frame now. Answers with the artifact the frame was stored as, what it was captured at, never with the image bytes.",
	record:
		"Record one playtest as MP4 and telemetry. Probe tick and input, then advance frames times (default 1), ticks_per_frame ticks each (default 1), waiting settle_ms after each advance (default 50). The host assigns the recording ID and path. Use sample_recording for PNG evidence frames.",
	list_recordings: "Every host recording for this Project, keyed by the host recordingProjectKey.",
	read_recording_video: "Path and metadata for one recording's MP4.",
	sample_recording:
		"Decode an existing MP4. Supply at_ms or every_ms. contact_sheet true requests a 3-column contact sheet.",
	read_telemetry: "One recording's stored telemetry. A recording whose retention window has passed answers expired.",
	list_comparisons: "The before/after comparisons already submitted for this Project.",
	submit_comparison: "Submit a before/after comparison over two captured frames with measured facts.",
	list_goldens: "Named golden frames this Project holds.",
	record_golden: "Capture the current frame as a named golden baseline.",
	check_golden: "Compare the current frame against a named golden. Default max_diff_ratio is 0.001.",
	read_stage_frame: "Return one frame's pixels together with the probe state that grounds them.",
	pick: "Resolve a screen point through the game's own hit test.",
	read_entity: "One entity's published parameters and their current values.",
	patch_entity: "Move one published parameter, for this page only. false is a refusal, never a silent no-op.",
	list_annotations: "Every annotation this Project holds, in the order the batch was left.",
	update_annotation:
		"Move one annotation along its lifecycle: acknowledge it, resolve it with before/after frames, or dismiss it with the reason stated.",
	verify_milestone:
		"Run the host Evaluation definition for this milestone, record the attempt id and the latest checkpoint id, and close the milestone. operation_id makes retries idempotent.",
	prepare_prototype_image:
		"Prepare one design-reference image from its production route and revisioned inputs. This is a design reference, never a runtime screenshot.",
	read_production_brief:
		"Read the complete current repository production brief, graph, source provenance and specification holes.",
	read_design_schema: "Read the current design graph JSON schema.",
	edit_design_graph:
		"Apply a reversible decision to an existing design node. Choose requires a group and rejects other Open siblings.",
	prepare_production:
		"Read one content node's explicit production input references, constraints and missing inputs. No execution occurs.",
	accept_design:
		"Present a compact Accept / Revise / Decline card. Only explicit acceptance of a still-current revision writes documents and lands the first-party scaffold into an empty implementation.",
	create_project:
		"Create a Game Project from one idea and an optional genre/substrate. Lands canvas2d or three scaffold files and persists the opening plus default milestone definitions.",
	start_dev_server:
		"Start the project's Vite dev server with an allocated localhost port and --strictPort, retrying when the port is busy.",
	stop_dev_server: "Stop the project's Vite dev server. The process is also stopped when the session ends.",
	probe_state: "Read the running game's probe state() snapshot through capture.offscreen.",
	probe_tick: "Read the running game's probe tick.",
	probe_advance: "Advance the running game a fixed number of probe steps.",
};
