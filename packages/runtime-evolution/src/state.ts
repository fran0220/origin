import {
	EVOLUTION_RECORD_TYPE,
	EVOLUTION_SCHEMA_VERSION,
	MAX_HARNESS_ENTRIES_PER_SCOPE,
	MAX_HARNESS_SCOPE_CONTENT_BYTES,
	MAX_REFINEMENT_EVENT_BYTES,
	MAX_REFINEMENT_TEXT_BYTES,
} from "./constants.js";
import { digestRefinementPayload, isSha256Digest } from "./digest.js";
import { EvolutionError, invalidEvolution } from "./errors.js";
import { formatScope, isGlobalScope, scopesEqual } from "./scope.js";
import type {
	AppliedHarnessEdit,
	EvolutionScope,
	EvolutionState,
	HarnessEdit,
	HarnessEntry,
	RefinementEvent,
	RefinementOrigin,
	RefinementProposal,
	RejectedHarnessEdit,
} from "./types.js";
import {
	deriveEntryId,
	entryTextBytes,
	normalizeHarnessEntry,
	validateEdit,
	validateOrigin,
	validateProposal,
	validateText,
} from "./validate.js";

export function emptyEvolutionState(scope: EvolutionScope): EvolutionState {
	return {
		scope,
		revision: 0,
		headDigest: null,
		entries: {},
	};
}

export function listEntries(state: EvolutionState): HarnessEntry[] {
	return Object.keys(state.entries)
		.sort()
		.map((id) => state.entries[id] as HarnessEntry);
}

export function totalEntryBytes(state: EvolutionState): number {
	return listEntries(state).reduce((sum, entry) => sum + entryTextBytes(entry), 0);
}

export function validateEvolutionState(state: EvolutionState): EvolutionState {
	const entries: Record<string, HarnessEntry> = {};
	for (const [id, entry] of Object.entries(state.entries)) {
		const normalized = normalizeHarnessEntry(entry);
		if (normalized.id !== id) {
			throw invalidEvolution("an entry is stored under a foreign ID");
		}
		entries[id] = normalized;
	}
	const next: EvolutionState = {
		scope: state.scope,
		revision: state.revision,
		headDigest: state.headDigest,
		entries,
	};
	if (!Number.isInteger(next.revision) || next.revision < 0) {
		throw invalidEvolution("evolution revision must be a non-negative integer");
	}
	if (next.headDigest !== null && !isSha256Digest(next.headDigest)) {
		throw invalidEvolution("evolution head digest must use the sha256 prefix");
	}
	if (Object.keys(next.entries).length > MAX_HARNESS_ENTRIES_PER_SCOPE) {
		throw invalidEvolution(
			`a scope holds ${Object.keys(next.entries).length} entries; maximum is ${MAX_HARNESS_ENTRIES_PER_SCOPE}`,
		);
	}
	if (totalEntryBytes(next) > MAX_HARNESS_SCOPE_CONTENT_BYTES) {
		throw invalidEvolution(`a scope's entry text exceeds ${MAX_HARNESS_SCOPE_CONTENT_BYTES} bytes`);
	}
	return next;
}

function checkBudgets(entries: Record<string, HarnessEntry>): void {
	const count = Object.keys(entries).length;
	if (count > MAX_HARNESS_ENTRIES_PER_SCOPE) {
		throw invalidEvolution(`the scope would exceed ${MAX_HARNESS_ENTRIES_PER_SCOPE} entries`);
	}
	const total = Object.values(entries).reduce((sum, entry) => sum + entryTextBytes(entry), 0);
	if (total > MAX_HARNESS_SCOPE_CONTENT_BYTES) {
		throw invalidEvolution(`the scope's entry text would exceed ${MAX_HARNESS_SCOPE_CONTENT_BYTES} bytes`);
	}
}

function cloneEntries(state: EvolutionState): Record<string, HarnessEntry> {
	return { ...state.entries };
}

function applyOneEdit(
	entries: Record<string, HarnessEntry>,
	edit: HarnessEdit,
	source: string,
	nowMs: number,
): AppliedHarnessEdit {
	const validated = validateEdit(edit);
	switch (validated.action) {
		case "create": {
			const entryId = validated.entry.id ?? deriveEntryId(validated.entry.title);
			if (entries[entryId]) {
				throw invalidEvolution(`entry '${entryId}' already exists`);
			}
			const created = normalizeHarnessEntry({
				id: entryId,
				kind: validated.entry.kind,
				title: validated.entry.title,
				content: validated.entry.content,
				...(validated.entry.skill ? { skill: validated.entry.skill } : {}),
				source,
				version: 1,
				createdAtMs: nowMs,
				updatedAtMs: nowMs,
			});
			entries[entryId] = created;
			try {
				checkBudgets(entries);
			} catch (error) {
				delete entries[entryId];
				throw error;
			}
			return { edit: validated, entryId, before: null, after: created };
		}
		case "update": {
			const existing = entries[validated.id];
			if (!existing) {
				throw invalidEvolution(`entry '${validated.id}' does not exist`);
			}
			if (existing.version !== validated.expectedVersion) {
				throw invalidEvolution(
					`entry '${validated.id}' changed during refinement planning: expected version ${validated.expectedVersion}, actual ${existing.version}`,
				);
			}
			if (validated.patch.skill && existing.kind !== "skill") {
				throw invalidEvolution(`a ${existing.kind} entry must not carry a skill contract`);
			}
			const nextVersion = existing.version + 1;
			if (!Number.isSafeInteger(nextVersion)) {
				throw new EvolutionError("revision-overflow", "evolution revision overflow");
			}
			const updated = normalizeHarnessEntry({
				...existing,
				title: validated.patch.title ?? existing.title,
				content: validated.patch.content ?? existing.content,
				...(validated.patch.skill
					? { skill: validated.patch.skill }
					: existing.skill
						? { skill: existing.skill }
						: {}),
				source,
				version: nextVersion,
				updatedAtMs: nowMs,
			});
			entries[validated.id] = updated;
			try {
				checkBudgets(entries);
			} catch (error) {
				entries[validated.id] = existing;
				throw error;
			}
			return { edit: validated, entryId: validated.id, before: existing, after: updated };
		}
		case "delete": {
			const existing = entries[validated.id];
			if (!existing) {
				throw invalidEvolution(`entry '${validated.id}' does not exist`);
			}
			if (existing.version !== validated.expectedVersion) {
				throw invalidEvolution(
					`entry '${validated.id}' changed during refinement planning: expected version ${validated.expectedVersion}, actual ${existing.version}`,
				);
			}
			delete entries[validated.id];
			return { edit: validated, entryId: validated.id, before: existing, after: null };
		}
	}
}

function digestPayload(event: Omit<RefinementEvent, "digest">): unknown {
	return {
		recordType: event.recordType,
		schemaVersion: event.schemaVersion,
		parentDigest: event.parentDigest,
		scope: event.scope,
		revision: event.revision,
		kind: event.kind,
		rolledBackDigest: event.rolledBackDigest ?? null,
		proposal: event.proposal,
		applied: event.applied,
		rejected: event.rejected,
		origin: event.origin,
		createdAtMs: event.createdAtMs,
	};
}

export async function sealRefinementEvent(event: Omit<RefinementEvent, "digest">): Promise<RefinementEvent> {
	const digest = await digestRefinementPayload(digestPayload(event));
	const sealed: RefinementEvent = { ...event, digest };
	validateRefinementEvent(sealed);
	return sealed;
}

export function validateRefinementEvent(event: RefinementEvent): RefinementEvent {
	if (event.recordType !== EVOLUTION_RECORD_TYPE) {
		throw invalidEvolution(`unsupported refinement event record type ${event.recordType}`);
	}
	if (event.schemaVersion !== EVOLUTION_SCHEMA_VERSION) {
		throw invalidEvolution(`unsupported refinement event schema ${event.schemaVersion}`);
	}
	if (!Number.isInteger(event.revision) || event.revision < 1) {
		throw invalidEvolution("a refinement event must advance its revision by exactly one");
	}
	if (!isSha256Digest(event.digest)) {
		throw invalidEvolution("refinement event digest must use the sha256 prefix");
	}
	if (event.parentDigest !== null && !isSha256Digest(event.parentDigest)) {
		throw invalidEvolution("parent digest must use the sha256 prefix");
	}
	if (event.kind === "rollback") {
		if (!event.rolledBackDigest || !isSha256Digest(event.rolledBackDigest)) {
			throw invalidEvolution("rolled-back event digest must use the sha256 prefix");
		}
	}
	validateProposal(event.proposal);
	validateOrigin(event.origin);
	if (event.applied.length === 0 && event.rejected.length === 0) {
		throw invalidEvolution("a refinement event must record at least one edit");
	}
	if (event.applied.length + event.rejected.length > event.proposal.edits.length && event.kind === "applied") {
		throw invalidEvolution("a refinement event records more edits than its proposal");
	}
	if (!Number.isInteger(event.createdAtMs) || event.createdAtMs < 0) {
		throw invalidEvolution("event createdAtMs must be a non-negative integer");
	}
	const encoded = JSON.stringify(event);
	if (encoded.length > MAX_REFINEMENT_EVENT_BYTES) {
		throw new EvolutionError(
			"event-too-large",
			`refinement event is ${encoded.length} bytes; maximum is ${MAX_REFINEMENT_EVENT_BYTES}`,
		);
	}
	return event;
}

export async function applyProposal(
	state: EvolutionState,
	proposal: RefinementProposal,
	source: string,
	origin: RefinementOrigin,
	nowMs: number,
): Promise<{ readonly state: EvolutionState; readonly event: RefinementEvent }> {
	const validatedProposal = validateProposal(proposal);
	validateText(source, 128, "refinement source", true);
	const validatedOrigin = validateOrigin(origin);
	const entries = cloneEntries(state);
	const applied: AppliedHarnessEdit[] = [];
	const rejected: RejectedHarnessEdit[] = [];
	for (const edit of validatedProposal.edits) {
		try {
			applied.push(applyOneEdit(entries, edit, source, nowMs));
		} catch (error) {
			rejected.push({
				edit,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	const nextRevision = state.revision + 1;
	if (!Number.isSafeInteger(nextRevision)) {
		throw new EvolutionError("revision-overflow", "evolution revision overflow");
	}
	const unsigned: Omit<RefinementEvent, "digest"> = {
		recordType: EVOLUTION_RECORD_TYPE,
		schemaVersion: EVOLUTION_SCHEMA_VERSION,
		parentDigest: state.headDigest,
		scope: state.scope,
		revision: nextRevision,
		kind: "applied",
		proposal: validatedProposal,
		applied,
		rejected,
		origin: validatedOrigin,
		createdAtMs: nowMs,
	};
	const event = await sealRefinementEvent(unsigned);
	const next = validateEvolutionState({
		scope: state.scope,
		revision: nextRevision,
		headDigest: event.digest,
		entries,
	});
	return { state: next, event };
}

function entriesEqual(left: HarnessEntry | undefined, right: HarnessEntry | null): boolean {
	if (!left && !right) return true;
	if (!left || !right) return false;
	return JSON.stringify(left) === JSON.stringify(right);
}

function invertAppliedEdit(edit: AppliedHarnessEdit): AppliedHarnessEdit {
	switch (edit.edit.action) {
		case "create":
			return {
				edit: { action: "delete", id: edit.entryId, expectedVersion: edit.after?.version ?? 1 },
				entryId: edit.entryId,
				before: edit.after,
				after: edit.before,
			};
		case "delete":
			return {
				edit: {
					action: "create",
					entry: {
						id: edit.entryId,
						kind: edit.before?.kind ?? "prompt",
						title: edit.before?.title ?? edit.entryId,
						content: edit.before?.content ?? "",
						...(edit.before?.skill ? { skill: edit.before.skill } : {}),
					},
				},
				entryId: edit.entryId,
				before: edit.after,
				after: edit.before,
			};
		case "update":
			return {
				edit: {
					action: "update",
					id: edit.entryId,
					expectedVersion: edit.after?.version ?? 1,
					patch: {
						title: edit.before?.title,
						content: edit.before?.content,
						...(edit.before?.skill ? { skill: edit.before.skill } : {}),
					},
				},
				entryId: edit.entryId,
				before: edit.after,
				after: edit.before,
			};
	}
}

export async function rollbackEvent(
	state: EvolutionState,
	event: RefinementEvent,
	reason: string,
	origin: RefinementOrigin,
	nowMs: number,
): Promise<{ readonly state: EvolutionState; readonly event: RefinementEvent }> {
	validateRefinementEvent(event);
	validateText(reason, MAX_REFINEMENT_TEXT_BYTES, "rollback reason", true);
	if (!scopesEqual(event.scope, state.scope)) {
		throw new EvolutionError(
			"scope-mismatch",
			`harness scope mismatch: expected ${formatScope(state.scope)}, actual ${formatScope(event.scope)}`,
		);
	}
	if (event.kind !== "applied") {
		throw new EvolutionError("rollback-conflict", "only an applied refinement event can be rolled back");
	}
	const entries = cloneEntries(state);
	const inverted: AppliedHarnessEdit[] = [];
	for (const applied of [...event.applied].reverse()) {
		const current = entries[applied.entryId];
		if (applied.before === null && applied.after) {
			if (!entriesEqual(current, applied.after)) {
				throw new EvolutionError(
					"rollback-conflict",
					`entry '${applied.entryId}' changed after the event being rolled back`,
				);
			}
			delete entries[applied.entryId];
		} else if (applied.before && applied.after) {
			if (!entriesEqual(current, applied.after)) {
				throw new EvolutionError(
					"rollback-conflict",
					`entry '${applied.entryId}' changed after the event being rolled back`,
				);
			}
			entries[applied.entryId] = applied.before;
		} else if (applied.before && applied.after === null) {
			if (current) {
				throw new EvolutionError(
					"rollback-conflict",
					`entry '${applied.entryId}' changed after the event being rolled back`,
				);
			}
			entries[applied.entryId] = applied.before;
		} else {
			throw new EvolutionError("rollback-conflict", "an applied edit records no snapshots");
		}
		inverted.push(invertAppliedEdit(applied));
	}
	const nextRevision = state.revision + 1;
	if (!Number.isSafeInteger(nextRevision)) {
		throw new EvolutionError("revision-overflow", "evolution revision overflow");
	}
	const unsigned: Omit<RefinementEvent, "digest"> = {
		recordType: EVOLUTION_RECORD_TYPE,
		schemaVersion: EVOLUTION_SCHEMA_VERSION,
		parentDigest: state.headDigest,
		scope: state.scope,
		revision: nextRevision,
		kind: "rollback",
		rolledBackDigest: event.digest,
		proposal: {
			summary: `rollback of refinement ${event.digest.slice(0, 15)}`,
			rationale: reason,
			expectedOutcome: "restore the exact pre-refinement harness entries",
			edits: inverted.map((item) => item.edit),
		},
		applied: inverted,
		rejected: [],
		origin: validateOrigin(origin),
		createdAtMs: nowMs,
	};
	const rollback = await sealRefinementEvent(unsigned);
	const next = validateEvolutionState({
		scope: state.scope,
		revision: nextRevision,
		headDigest: rollback.digest,
		entries,
	});
	return { state: next, event: rollback };
}

export function replayEvents(scope: EvolutionScope, events: readonly RefinementEvent[]): EvolutionState {
	let state = emptyEvolutionState(scope);
	for (const event of events) {
		validateRefinementEvent(event);
		if (!scopesEqual(event.scope, scope)) {
			throw new EvolutionError(
				"scope-mismatch",
				`harness scope mismatch: expected ${formatScope(scope)}, actual ${formatScope(event.scope)}`,
			);
		}
		if (event.parentDigest !== state.headDigest) {
			throw invalidEvolution("refinement event parent digest does not match the stored chain");
		}
		if (event.revision !== state.revision + 1) {
			throw invalidEvolution("a refinement event must advance its revision by exactly one");
		}
		const entries = cloneEntries(state);
		if (event.kind === "applied") {
			for (const applied of event.applied) {
				if (applied.after) {
					entries[applied.entryId] = normalizeHarnessEntry(applied.after);
				} else {
					delete entries[applied.entryId];
				}
			}
		} else {
			for (const applied of event.applied) {
				if (applied.after) {
					entries[applied.entryId] = normalizeHarnessEntry(applied.after);
				} else {
					delete entries[applied.entryId];
				}
			}
		}
		state = validateEvolutionState({
			scope,
			revision: event.revision,
			headDigest: event.digest,
			entries,
		});
	}
	return state;
}

export function assertGlobalAndSubject(global: EvolutionState | null, subject: EvolutionState | null): void {
	if (global && !isGlobalScope(global.scope)) {
		throw new EvolutionError(
			"scope-mismatch",
			`harness scope mismatch: expected global, actual ${formatScope(global.scope)}`,
		);
	}
	if (subject && isGlobalScope(subject.scope)) {
		throw new EvolutionError(
			"scope-mismatch",
			`harness scope mismatch: expected subject, actual ${formatScope(subject.scope)}`,
		);
	}
}
