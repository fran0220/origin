import { HISTORY_DEPTH, HOST_SOURCE, REFINEMENT_SOURCE } from "./constants.js";
import { isEvolutionError, LedgerRefusal } from "./errors.js";
import { renderHarnessSupplement } from "./render.js";
import { formatScope, globalScope, isGlobalScope, promotionSource, subjectScope } from "./scope.js";
import { applyProposal, emptyEvolutionState, rollbackEvent, validateEvolutionState } from "./state.js";
import type {
	EvolutionLedgerStore,
	EvolutionScope,
	EvolutionState,
	HarnessEntry,
	HarnessProjection,
	RefinementEvent,
	RefinementOrigin,
	RefinementOutcome,
	RefinementProposal,
} from "./types.js";
import { HOST_ORIGIN } from "./types.js";

export { HOST_ORIGIN, HOST_SOURCE, REFINEMENT_SOURCE };

function failed(error: unknown): LedgerRefusal {
	if (error instanceof LedgerRefusal) return error;
	return LedgerRefusal.failed(error instanceof Error ? error.message : String(error));
}

async function confirmCommit(
	store: EvolutionLedgerStore,
	scope: EvolutionScope,
	intended: EvolutionState,
	status: "committed" | "revision-conflict" | "unknown",
	storedRevision: number,
): Promise<void> {
	if (status === "committed") return;
	if (status === "revision-conflict") {
		throw LedgerRefusal.revisionConflict(storedRevision);
	}
	const loaded = await store.load(scope);
	if (loaded.revision === intended.revision && loaded.headDigest === intended.headDigest) {
		return;
	}
	throw LedgerRefusal.unsettled();
}

export class EvolutionLedger {
	constructor(private readonly store: EvolutionLedgerStore) {}

	async state(scope: EvolutionScope): Promise<EvolutionState> {
		try {
			return validateEvolutionState(await this.store.load(scope));
		} catch (error) {
			throw failed(error);
		}
	}

	async history(scope: EvolutionScope, limit = HISTORY_DEPTH): Promise<readonly RefinementEvent[]> {
		try {
			return await this.store.history(scope, limit);
		} catch (error) {
			throw failed(error);
		}
	}

	async record(
		scope: EvolutionScope,
		proposal: RefinementProposal,
		source: string,
		origin: RefinementOrigin,
		nowMs: number,
	): Promise<RefinementOutcome> {
		const current = await this.state(scope);
		let next: EvolutionState;
		let event: RefinementEvent;
		try {
			({ state: next, event } = await applyProposal(current, proposal, source, origin, nowMs));
		} catch (error) {
			throw failed(error);
		}
		try {
			const commit = await this.store.commit({
				scope,
				expectedRevision: current.revision,
				state: next,
				event,
			});
			await confirmCommit(this.store, scope, next, commit.status, commit.storedRevision);
		} catch (error) {
			throw failed(error);
		}
		return {
			revision: next.revision,
			digest: event.digest,
			applied: event.applied,
			rejected: event.rejected,
		};
	}

	async rollback(
		scope: EvolutionScope,
		digest: string,
		reason: string,
		origin: RefinementOrigin,
		nowMs: number,
	): Promise<RefinementOutcome> {
		const history = await this.history(scope, HISTORY_DEPTH);
		const reversed = history.find((event) => event.digest === digest);
		if (!reversed) {
			throw LedgerRefusal.failed("that change is no longer in the history this surface reads");
		}
		const current = await this.state(scope);
		let next: EvolutionState;
		let event: RefinementEvent;
		try {
			({ state: next, event } = await rollbackEvent(current, reversed, reason, origin, nowMs));
		} catch (error) {
			if (isEvolutionError(error) && error.code === "rollback-conflict") {
				throw LedgerRefusal.notReversible(error.message);
			}
			throw failed(error);
		}
		try {
			const commit = await this.store.commit({
				scope,
				expectedRevision: current.revision,
				state: next,
				event,
			});
			await confirmCommit(this.store, scope, next, commit.status, commit.storedRevision);
		} catch (error) {
			throw failed(error);
		}
		return {
			revision: next.revision,
			digest: event.digest,
			applied: event.applied,
			rejected: event.rejected,
		};
	}

	async promote(
		subject: EvolutionScope,
		entryId: string,
		origin: RefinementOrigin,
		nowMs: number,
	): Promise<RefinementOutcome> {
		const proposal = await this.promotionProposal(subject, entryId);
		return this.record(globalScope(), proposal, promotionSource(subject), origin, nowMs);
	}

	async promotionProposal(subject: EvolutionScope, entryId: string): Promise<RefinementProposal> {
		if (isGlobalScope(subject)) {
			throw LedgerRefusal.failed("the shared baseline cannot be promoted into itself");
		}
		const scoped = await this.state(subject);
		const entry = scoped.entries[entryId];
		if (!entry) {
			throw LedgerRefusal.failed(`'${entryId}' is not an entry of this subject`);
		}
		const baseline = await this.state(globalScope());
		const existing = baseline.entries[entryId];
		const edit = existing
			? {
					action: "update" as const,
					id: entryId,
					expectedVersion: existing.version,
					patch: {
						title: entry.title,
						content: entry.content,
						...(entry.skill ? { skill: entry.skill } : {}),
					},
				}
			: {
					action: "create" as const,
					entry: {
						id: entry.id,
						kind: entry.kind,
						title: entry.title,
						content: entry.content,
						...(entry.skill ? { skill: entry.skill } : {}),
					},
				};
		return {
			summary: `promote '${entry.title}' into the shared baseline`,
			rationale: `this evaluation finding came from ${formatScope(subject)} and applies beyond it`,
			expectedOutcome: "every subject starts from this baseline entry",
			edits: [edit],
		};
	}

	async hostCreate(
		scope: EvolutionScope,
		entry: Omit<HarnessEntry, "source" | "version" | "createdAtMs" | "updatedAtMs"> & { readonly id?: string },
		nowMs: number,
	): Promise<RefinementOutcome> {
		return this.record(
			scope,
			{
				summary: `create '${entry.title}'`,
				rationale: "written from the harness settings surface",
				expectedOutcome: "later Turns start from this entry",
				edits: [
					{
						action: "create",
						entry: {
							...(entry.id ? { id: entry.id } : {}),
							kind: entry.kind,
							title: entry.title,
							content: entry.content,
							...(entry.skill ? { skill: entry.skill } : {}),
						},
					},
				],
			},
			HOST_SOURCE,
			HOST_ORIGIN,
			nowMs,
		);
	}

	async hostUpdate(
		scope: EvolutionScope,
		entryId: string,
		patch: { readonly title?: string; readonly content?: string; readonly skill?: HarnessEntry["skill"] },
		nowMs: number,
	): Promise<RefinementOutcome> {
		const current = await this.state(scope);
		const existing = current.entries[entryId];
		if (!existing) {
			throw LedgerRefusal.failed(`'${entryId}' is not an entry of this scope`);
		}
		return this.record(
			scope,
			{
				summary: `update '${existing.title}'`,
				rationale: "edited from the harness settings surface",
				expectedOutcome: "later Turns start from the new wording",
				edits: [
					{
						action: "update",
						id: entryId,
						expectedVersion: existing.version,
						patch,
					},
				],
			},
			HOST_SOURCE,
			HOST_ORIGIN,
			nowMs,
		);
	}

	async hostDelete(scope: EvolutionScope, entryId: string, nowMs: number): Promise<RefinementOutcome> {
		const current = await this.state(scope);
		const existing = current.entries[entryId];
		if (!existing) {
			throw LedgerRefusal.failed(`'${entryId}' is not an entry of this scope`);
		}
		return this.record(
			scope,
			{
				summary: `delete '${existing.title}'`,
				rationale: "removed from the harness settings surface",
				expectedOutcome: "later Turns no longer start from it",
				edits: [{ action: "delete", id: entryId, expectedVersion: existing.version }],
			},
			HOST_SOURCE,
			HOST_ORIGIN,
			nowMs,
		);
	}

	async projection(subjectId?: string): Promise<HarnessProjection> {
		const global = await this.state(globalScope());
		const globalHistory = await this.history(globalScope(), HISTORY_DEPTH);
		const subject = subjectId ? await this.state(subjectScope(subjectId)) : null;
		const subjectHistory = subjectId ? await this.history(subjectScope(subjectId), HISTORY_DEPTH) : [];
		const recentEvents = [...globalHistory, ...subjectHistory].sort(
			(left, right) => right.createdAtMs - left.createdAtMs,
		);
		return {
			global,
			subject,
			recentEvents,
			rendered: renderHarnessSupplement(global, subject, recentEvents),
		};
	}
}

export function emptyLedgerState(scope: EvolutionScope): EvolutionState {
	return emptyEvolutionState(scope);
}
