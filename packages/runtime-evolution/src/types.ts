import type { HARNESS_ENTRY_KINDS } from "./constants.js";

export type HarnessEntryKind = (typeof HARNESS_ENTRY_KINDS)[number];

export type EvolutionScope = { readonly kind: "global" } | { readonly kind: "subject"; readonly subjectId: string };

export interface HarnessSkillContract {
	readonly invocation: string;
	readonly arguments?: Readonly<Record<string, string>>;
}

export type HarnessEntrySource = "refine" | "host" | `promote:${string}`;

export interface HarnessEntry {
	readonly id: string;
	readonly kind: HarnessEntryKind;
	readonly title: string;
	readonly content: string;
	readonly skill?: HarnessSkillContract;
	readonly source: string;
	readonly version: number;
	readonly createdAtMs: number;
	readonly updatedAtMs: number;
}

export type HarnessCreateEntry = {
	readonly id?: string;
	readonly kind: HarnessEntryKind;
	readonly title: string;
	readonly content: string;
	readonly skill?: HarnessSkillContract;
};

export type HarnessEntryPatch = {
	readonly title?: string;
	readonly content?: string;
	readonly skill?: HarnessSkillContract;
};

export type HarnessEdit =
	| { readonly action: "create"; readonly entry: HarnessCreateEntry }
	| {
			readonly action: "update";
			readonly id: string;
			readonly expectedVersion: number;
			readonly patch: HarnessEntryPatch;
	  }
	| { readonly action: "delete"; readonly id: string; readonly expectedVersion: number };

export interface RefinementProposal {
	readonly summary: string;
	readonly rationale: string;
	readonly expectedOutcome: string;
	readonly edits: readonly HarnessEdit[];
}

export interface AppliedHarnessEdit {
	readonly edit: HarnessEdit;
	readonly entryId: string;
	readonly before: HarnessEntry | null;
	readonly after: HarnessEntry | null;
}

export interface RejectedHarnessEdit {
	readonly edit: HarnessEdit;
	readonly reason: string;
}

export interface RefinementOrigin {
	readonly sessionId: string;
	readonly turnId: string;
	readonly toolCallId: string;
}

export type RefinementEventKind = "applied" | "rollback";

export interface RefinementEvent {
	readonly recordType: "evolution.refinement-event";
	readonly schemaVersion: 1;
	readonly digest: string;
	readonly parentDigest: string | null;
	readonly scope: EvolutionScope;
	readonly revision: number;
	readonly kind: RefinementEventKind;
	readonly rolledBackDigest?: string;
	readonly proposal: RefinementProposal;
	readonly applied: readonly AppliedHarnessEdit[];
	readonly rejected: readonly RejectedHarnessEdit[];
	readonly origin: RefinementOrigin;
	readonly createdAtMs: number;
}

export interface EvolutionState {
	readonly scope: EvolutionScope;
	readonly revision: number;
	readonly headDigest: string | null;
	readonly entries: Readonly<Record<string, HarnessEntry>>;
}

export interface RefinementOutcome {
	readonly revision: number;
	readonly digest: string;
	readonly applied: readonly AppliedHarnessEdit[];
	readonly rejected: readonly RejectedHarnessEdit[];
}

export const HOST_ORIGIN: RefinementOrigin = {
	sessionId: "host",
	turnId: "host",
	toolCallId: "host",
};

export type EvolutionCommitStatus = "committed" | "revision-conflict" | "unknown";

export interface EvolutionCommitResult {
	readonly status: EvolutionCommitStatus;
	readonly storedRevision: number;
}

export interface EvolutionLedgerStore {
	load(scope: EvolutionScope): Promise<EvolutionState>;
	commit(input: {
		readonly scope: EvolutionScope;
		readonly expectedRevision: number;
		readonly state: EvolutionState;
		readonly event: RefinementEvent;
	}): Promise<EvolutionCommitResult>;
	history(scope: EvolutionScope, limit: number): Promise<readonly RefinementEvent[]>;
	event(scope: EvolutionScope, digest: string): Promise<RefinementEvent | undefined>;
}

export interface HarnessProjection {
	readonly global: EvolutionState;
	readonly subject: EvolutionState | null;
	readonly recentEvents: readonly RefinementEvent[];
	readonly rendered: string | null;
}
