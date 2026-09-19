export type DesktopEvolutionScope =
	| { readonly kind: "global" }
	| { readonly kind: "subject"; readonly subjectId: string };

export type DesktopHarnessEntryKind = "prompt" | "memory" | "skill" | "subagent";

export interface DesktopHarnessSkillContract {
	readonly invocation: string;
	readonly arguments?: Readonly<Record<string, string>>;
}

export interface DesktopHarnessEntry {
	readonly id: string;
	readonly kind: DesktopHarnessEntryKind;
	readonly title: string;
	readonly content: string;
	readonly skill?: DesktopHarnessSkillContract;
	readonly source: string;
	readonly version: number;
	readonly createdAtMs: number;
	readonly updatedAtMs: number;
}

export type DesktopHarnessEdit =
	| {
			readonly action: "create";
			readonly entry: {
				readonly id?: string;
				readonly kind: DesktopHarnessEntryKind;
				readonly title: string;
				readonly content: string;
				readonly skill?: DesktopHarnessSkillContract;
			};
	  }
	| {
			readonly action: "update";
			readonly id: string;
			readonly expectedVersion: number;
			readonly patch: {
				readonly title?: string;
				readonly content?: string;
				readonly skill?: DesktopHarnessSkillContract;
			};
	  }
	| { readonly action: "delete"; readonly id: string; readonly expectedVersion: number };

export interface DesktopRefinementProposal {
	readonly summary: string;
	readonly rationale: string;
	readonly expectedOutcome: string;
	readonly edits: readonly DesktopHarnessEdit[];
}

export interface DesktopAppliedHarnessEdit {
	readonly edit: DesktopHarnessEdit;
	readonly entryId: string;
	readonly before: DesktopHarnessEntry | null;
	readonly after: DesktopHarnessEntry | null;
}

export interface DesktopRejectedHarnessEdit {
	readonly edit: DesktopHarnessEdit;
	readonly reason: string;
}

export interface DesktopRefinementOutcome {
	readonly revision: number;
	readonly digest: string;
	readonly applied: readonly DesktopAppliedHarnessEdit[];
	readonly rejected: readonly DesktopRejectedHarnessEdit[];
}

export interface DesktopRefinementEvent {
	readonly digest: string;
	readonly parentDigest: string | null;
	readonly scope: DesktopEvolutionScope;
	readonly revision: number;
	readonly kind: "applied" | "rollback";
	readonly rolledBackDigest?: string;
	readonly proposal: DesktopRefinementProposal;
	readonly applied: readonly DesktopAppliedHarnessEdit[];
	readonly rejected: readonly DesktopRejectedHarnessEdit[];
	readonly createdAtMs: number;
}

export interface DesktopEvolutionReadResult {
	readonly scope: DesktopEvolutionScope;
	readonly revision: number;
	readonly headDigest: string | null;
	readonly entries: readonly DesktopHarnessEntry[];
	readonly budget: {
		readonly entries: number;
		readonly entryLimit: number;
		readonly bytes: number;
		readonly byteLimit: number;
	};
}

export interface DesktopEvolutionApi {
	read(scope: DesktopEvolutionScope): Promise<DesktopEvolutionReadResult>;
	commit(input: {
		readonly scope: DesktopEvolutionScope;
		readonly proposal: DesktopRefinementProposal;
		readonly source?: string;
	}): Promise<DesktopRefinementOutcome>;
	rollback(input: {
		readonly scope: DesktopEvolutionScope;
		readonly digest: string;
		readonly reason?: string;
	}): Promise<DesktopRefinementOutcome>;
	promote(input: { readonly subjectId: string; readonly entryId: string }): Promise<DesktopRefinementOutcome>;
	history(input: {
		readonly scope: DesktopEvolutionScope;
		readonly limit?: number;
	}): Promise<readonly DesktopRefinementEvent[]>;
}
