export const EVOLUTION_RECORD_TYPE = "evolution.refinement-event" as const;
export const EVOLUTION_SCHEMA_VERSION = 1;

export const REFINEMENT_EVENT_DIGEST_DOMAIN = "vetta.evolution.refinement-event.v1\0";

export const MAX_HARNESS_ENTRIES_PER_SCOPE = 256;
export const MAX_HARNESS_SCOPE_CONTENT_BYTES = 192 * 1024;
export const MAX_HARNESS_ENTRY_ID_BYTES = 128;
export const MAX_HARNESS_ENTRY_TITLE_BYTES = 256;
export const MAX_HARNESS_ENTRY_CONTENT_BYTES = 64 * 1024;
export const MAX_HARNESS_SKILL_ARGUMENTS = 32;
export const MAX_REFINEMENT_EDITS = 32;
export const MAX_REFINEMENT_TEXT_BYTES = 4 * 1024;
export const MAX_ENTRY_SOURCE_BYTES = 128;
export const MAX_SKILL_INVOCATION_BYTES = 1024;
export const MAX_SKILL_ARGUMENT_NAME_BYTES = 64;
export const MAX_SKILL_ARGUMENT_DOC_BYTES = 1024;
export const MAX_SUBJECT_ID_BYTES = 512;
export const MAX_ORIGIN_ID_BYTES = 256;
export const HISTORY_DEPTH = 64;
export const MAX_RENDERED_REFINEMENT_HISTORY = 5;
export const MAX_REFINEMENT_EVENT_BYTES = 2 * 1024 * 1024;

export const HARNESS_SUPPLEMENT_BEGIN = "<continual_harness>";
export const HARNESS_SUPPLEMENT_END = "</continual_harness>";

export const REFINEMENT_SOURCE = "refine";
export const HOST_SOURCE = "host";
export const PROMOTION_SOURCE_PREFIX = "promote:";
export const HOME_SUBJECT_ID = "home";

export const HARNESS_ENTRY_KINDS = ["prompt", "memory", "skill", "subagent"] as const;
export const HARNESS_KIND_HEADINGS = {
	prompt: "Prompt Notes",
	memory: "Memories",
	skill: "Skills",
	subagent: "Subagents",
} as const;
