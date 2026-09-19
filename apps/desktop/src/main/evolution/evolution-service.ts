import { getAgentDir } from "@vetta/coding-agent/config";
import {
	EvolutionLedger,
	type EvolutionScope,
	type EvolutionState,
	formatScope,
	globalScope,
	HOME_SUBJECT_ID,
	HOST_ORIGIN,
	HOST_SOURCE,
	isLedgerRefusal,
	listEntries,
	MAX_HARNESS_ENTRIES_PER_SCOPE,
	MAX_HARNESS_SCOPE_CONTENT_BYTES,
	type RefinementEvent,
	type RefinementOutcome,
	type RefinementProposal,
	subjectScope,
} from "@vetta/runtime-evolution";
import { createFileEvolutionLedgerStore } from "@vetta/runtime-node/evolution";
import { DEFAULT_CONVERSATION_CWD, readConfigSync } from "../config/desktop-config-store.js";
import { resolveAccountScopedDirForHost } from "../connections/account-directory.js";
import { sameProjectPath } from "../projects/project-path.js";

export type EvolutionScopeInput =
	| { readonly kind: "global" }
	| { readonly kind: "subject"; readonly subjectId: string };

export interface EvolutionReadResult {
	readonly scope: EvolutionScope;
	readonly revision: number;
	readonly headDigest: string | null;
	readonly entries: ReturnType<typeof listEntries>;
	readonly budget: {
		readonly entries: number;
		readonly entryLimit: number;
		readonly bytes: number;
		readonly byteLimit: number;
	};
}

export function resolveDesktopEvolutionLedgerRoot(agentDir = getAgentDir()): string {
	return resolveAccountScopedDirForHost("evolution", agentDir);
}

let sharedLedger: EvolutionLedger | undefined;
let sharedLedgerRoot: string | undefined;

export function getDesktopEvolutionLedger(): EvolutionLedger {
	const root = resolveDesktopEvolutionLedgerRoot();
	if (!sharedLedger || sharedLedgerRoot !== root) {
		sharedLedger = new EvolutionLedger(createFileEvolutionLedgerStore(root));
		sharedLedgerRoot = root;
	}
	return sharedLedger;
}

export function resolveDesktopHarnessSubjectId(cwd?: string): string {
	const path = cwd?.trim() || DEFAULT_CONVERSATION_CWD;
	const config = readConfigSync();
	const project = config.projects.find((entry) => sameProjectPath(entry.path, path));
	if (project) return project.path;
	if (sameProjectPath(path, DEFAULT_CONVERSATION_CWD)) return HOME_SUBJECT_ID;
	return path;
}

function parseScope(input: EvolutionScopeInput): EvolutionScope {
	return input.kind === "global" ? globalScope() : subjectScope(input.subjectId);
}

function toReadResult(state: EvolutionState): EvolutionReadResult {
	const entries = listEntries(state);
	return {
		scope: state.scope,
		revision: state.revision,
		headDigest: state.headDigest,
		entries,
		budget: {
			entries: entries.length,
			entryLimit: MAX_HARNESS_ENTRIES_PER_SCOPE,
			bytes: entries.reduce((sum, entry) => sum + entry.title.length + entry.content.length, 0),
			byteLimit: MAX_HARNESS_SCOPE_CONTENT_BYTES,
		},
	};
}

function rethrow(error: unknown): never {
	if (isLedgerRefusal(error)) {
		throw Object.assign(new Error(error.message), { code: error.code, storedRevision: error.storedRevision });
	}
	throw error;
}

export class DesktopEvolutionService {
	constructor(private readonly ledger = getDesktopEvolutionLedger()) {}

	async read(input: EvolutionScopeInput): Promise<EvolutionReadResult> {
		try {
			return toReadResult(await this.ledger.state(parseScope(input)));
		} catch (error) {
			rethrow(error);
		}
	}

	async commit(input: {
		readonly scope: EvolutionScopeInput;
		readonly proposal: RefinementProposal;
		readonly source?: string;
	}): Promise<RefinementOutcome> {
		try {
			return await this.ledger.record(
				parseScope(input.scope),
				input.proposal,
				input.source ?? HOST_SOURCE,
				HOST_ORIGIN,
				Date.now(),
			);
		} catch (error) {
			rethrow(error);
		}
	}

	async rollback(input: {
		readonly scope: EvolutionScopeInput;
		readonly digest: string;
		readonly reason?: string;
	}): Promise<RefinementOutcome> {
		try {
			return await this.ledger.rollback(
				parseScope(input.scope),
				input.digest,
				input.reason ?? "taken back from the harness settings surface",
				HOST_ORIGIN,
				Date.now(),
			);
		} catch (error) {
			rethrow(error);
		}
	}

	async promote(input: { readonly subjectId: string; readonly entryId: string }): Promise<RefinementOutcome> {
		try {
			return await this.ledger.promote(subjectScope(input.subjectId), input.entryId, HOST_ORIGIN, Date.now());
		} catch (error) {
			rethrow(error);
		}
	}

	async history(input: {
		readonly scope: EvolutionScopeInput;
		readonly limit?: number;
	}): Promise<readonly RefinementEvent[]> {
		try {
			return await this.ledger.history(parseScope(input.scope), input.limit ?? 64);
		} catch (error) {
			rethrow(error);
		}
	}
}

export function describeEvolutionScope(scope: EvolutionScope): string {
	return formatScope(scope);
}
