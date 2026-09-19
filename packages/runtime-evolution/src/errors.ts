export type EvolutionErrorCode =
	| "invalid"
	| "scope-mismatch"
	| "revision-overflow"
	| "event-too-large"
	| "rollback-conflict";

export class EvolutionError extends Error {
	readonly code: EvolutionErrorCode;

	constructor(code: EvolutionErrorCode, message: string) {
		super(message);
		this.name = "EvolutionError";
		this.code = code;
	}
}

export function invalidEvolution(message: string): EvolutionError {
	return new EvolutionError("invalid", message);
}

export type LedgerRefusalCode = "revision-conflict" | "unsettled" | "not-reversible" | "failed";

export class LedgerRefusal extends Error {
	readonly code: LedgerRefusalCode;
	readonly storedRevision?: number;

	constructor(code: LedgerRefusalCode, message: string, storedRevision?: number) {
		super(message);
		this.name = "LedgerRefusal";
		this.code = code;
		this.storedRevision = storedRevision;
	}

	static revisionConflict(storedRevision: number): LedgerRefusal {
		return new LedgerRefusal(
			"revision-conflict",
			`the ledger moved to revision ${storedRevision} while this refinement was being planned, so nothing was written`,
			storedRevision,
		);
	}

	static unsettled(): LedgerRefusal {
		return new LedgerRefusal("unsettled", "the ledger could not confirm whether this refinement was committed");
	}

	static notReversible(reason: string): LedgerRefusal {
		return new LedgerRefusal(
			"not-reversible",
			`this change cannot be taken back as a whole because something it wrote has changed since: ${reason}`,
		);
	}

	static failed(message: string): LedgerRefusal {
		return new LedgerRefusal("failed", message);
	}
}

export function isLedgerRefusal(error: unknown): error is LedgerRefusal {
	return error instanceof LedgerRefusal;
}

export function isEvolutionError(error: unknown): error is EvolutionError {
	return error instanceof EvolutionError;
}
