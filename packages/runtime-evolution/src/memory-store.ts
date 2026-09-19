import { HISTORY_DEPTH } from "./constants.js";
import { formatScope } from "./scope.js";
import { emptyEvolutionState, replayEvents, validateEvolutionState } from "./state.js";
import type {
	EvolutionCommitResult,
	EvolutionLedgerStore,
	EvolutionScope,
	EvolutionState,
	RefinementEvent,
} from "./types.js";

function keyOf(scope: EvolutionScope): string {
	return formatScope(scope);
}

/** In-memory ledger store for tests and host fakes. */
export class MemoryEvolutionLedgerStore implements EvolutionLedgerStore {
	private readonly events = new Map<string, RefinementEvent[]>();

	async load(scope: EvolutionScope): Promise<EvolutionState> {
		const events = this.events.get(keyOf(scope)) ?? [];
		return events.length === 0 ? emptyEvolutionState(scope) : replayEvents(scope, events);
	}

	async commit(input: {
		readonly scope: EvolutionScope;
		readonly expectedRevision: number;
		readonly state: EvolutionState;
		readonly event: RefinementEvent;
	}): Promise<EvolutionCommitResult> {
		const key = keyOf(input.scope);
		const current = this.events.get(key) ?? [];
		const storedRevision = current.length === 0 ? 0 : (current[current.length - 1]?.revision ?? 0);
		if (storedRevision !== input.expectedRevision) {
			return { status: "revision-conflict", storedRevision };
		}
		this.events.set(key, [...current, input.event]);
		validateEvolutionState(input.state);
		return { status: "committed", storedRevision: input.event.revision };
	}

	async history(scope: EvolutionScope, limit: number): Promise<readonly RefinementEvent[]> {
		const events = this.events.get(keyOf(scope)) ?? [];
		const bounded = limit > 0 ? events.slice(-Math.min(limit, HISTORY_DEPTH)) : events.slice(-HISTORY_DEPTH);
		return [...bounded].reverse();
	}

	async event(scope: EvolutionScope, digest: string): Promise<RefinementEvent | undefined> {
		return (this.events.get(keyOf(scope)) ?? []).find((item) => item.digest === digest);
	}
}
