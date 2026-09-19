export {
	EVOLUTION_RECORD_TYPE,
	EVOLUTION_SCHEMA_VERSION,
	HARNESS_ENTRY_KINDS,
	HARNESS_KIND_HEADINGS,
	HARNESS_SUPPLEMENT_BEGIN,
	HARNESS_SUPPLEMENT_END,
	HISTORY_DEPTH,
	HOME_SUBJECT_ID,
	HOST_SOURCE,
	MAX_HARNESS_ENTRIES_PER_SCOPE,
	MAX_HARNESS_ENTRY_CONTENT_BYTES,
	MAX_HARNESS_SCOPE_CONTENT_BYTES,
	MAX_REFINEMENT_EDITS,
	MAX_RENDERED_REFINEMENT_HISTORY,
	PROMOTION_SOURCE_PREFIX,
	REFINEMENT_EVENT_DIGEST_DOMAIN,
	REFINEMENT_SOURCE,
} from "./constants.js";
export { canonicalizeJson, digestRefinementPayload, isSha256Digest, sha256Hex, stableJson } from "./digest.js";
export { EvolutionError, isEvolutionError, isLedgerRefusal, LedgerRefusal } from "./errors.js";
export { EvolutionLedger, emptyLedgerState, HOST_ORIGIN } from "./ledger.js";
export { MemoryEvolutionLedgerStore } from "./memory-store.js";
export { mergeHarnessLayers, renderHarnessSupplement } from "./render.js";
export {
	EvolutionScopeSchema,
	HarnessEditSchema,
	parseRefinementEventRecord,
	RefinementEventSchema,
	RefinementProposalSchema,
} from "./schema.js";
export {
	formatScope,
	globalScope,
	homeScope,
	isGlobalScope,
	parseScope,
	promotedFrom,
	promotionSource,
	scopeStorageKey,
	scopesEqual,
	subjectScope,
} from "./scope.js";
export {
	applyProposal,
	assertGlobalAndSubject,
	emptyEvolutionState,
	listEntries,
	replayEvents,
	rollbackEvent,
	sealRefinementEvent,
	totalEntryBytes,
	validateEvolutionState,
	validateRefinementEvent,
} from "./state.js";
export type {
	AppliedHarnessEdit,
	EvolutionCommitResult,
	EvolutionCommitStatus,
	EvolutionLedgerStore,
	EvolutionScope,
	EvolutionState,
	HarnessCreateEntry,
	HarnessEdit,
	HarnessEntry,
	HarnessEntryKind,
	HarnessEntryPatch,
	HarnessEntrySource,
	HarnessProjection,
	HarnessSkillContract,
	RefinementEvent,
	RefinementEventKind,
	RefinementOrigin,
	RefinementOutcome,
	RefinementProposal,
	RejectedHarnessEdit,
} from "./types.js";
export {
	deriveEntryId,
	entryTextBytes,
	normalizeHarnessEntry,
	validateEdit,
	validateProposal,
	validateText,
} from "./validate.js";
