import type { EvolutionLedger, EvolutionScope, HarnessProjection } from "@origin/runtime-evolution";
import type { CodingAgentRuntimeToolRegistration } from "../../runtime-contracts/index.js";

export interface CodingAgentHarnessRuntime {
	readonly subject: EvolutionScope;
	readonly ledger: EvolutionLedger;
	readonly toolRegistrations: readonly CodingAgentRuntimeToolRegistration[];
	renderPromptHarness(): Promise<string>;
	readProjection(): Promise<HarnessProjection>;
	dispose(): void;
}

export interface CodingAgentHarnessRuntimeOptions {
	readonly ledger: EvolutionLedger;
	readonly subjectId: string;
	readonly now?: () => number;
}
