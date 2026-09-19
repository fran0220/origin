import {
	HARNESS_KIND_HEADINGS,
	HARNESS_SUPPLEMENT_BEGIN,
	HARNESS_SUPPLEMENT_END,
	MAX_RENDERED_REFINEMENT_HISTORY,
} from "./constants.js";
import { formatScope, isGlobalScope } from "./scope.js";
import { assertGlobalAndSubject, listEntries, validateEvolutionState } from "./state.js";
import type { EvolutionState, HarnessEntry, HarnessEntryKind, RefinementEvent } from "./types.js";

const KIND_ORDER: readonly HarnessEntryKind[] = ["prompt", "memory", "skill", "subagent"];

function overlayEntries(
	global: EvolutionState | null,
	subject: EvolutionState | null,
): Array<{
	readonly entry: HarnessEntry;
	readonly layer: "global" | "subject";
}> {
	const merged = new Map<string, { entry: HarnessEntry; layer: "global" | "subject" }>();
	if (global) {
		for (const entry of listEntries(global)) {
			merged.set(entry.id, { entry, layer: "global" });
		}
	}
	if (subject) {
		for (const entry of listEntries(subject)) {
			merged.set(entry.id, { entry, layer: "subject" });
		}
	}
	return [...merged.values()].sort((left, right) => left.entry.id.localeCompare(right.entry.id));
}

export function mergeHarnessLayers(
	global: EvolutionState | null,
	subject: EvolutionState | null,
): readonly HarnessEntry[] {
	return overlayEntries(global, subject).map(({ entry }) => entry);
}

export function renderHarnessSupplement(
	global: EvolutionState | null,
	subject: EvolutionState | null,
	recentEvents: readonly RefinementEvent[],
): string | null {
	if (global) validateEvolutionState(global);
	if (subject) validateEvolutionState(subject);
	assertGlobalAndSubject(global, subject);
	const merged = overlayEntries(global, subject);
	if (merged.length === 0) return null;

	const lines: string[] = [
		HARNESS_SUPPLEMENT_BEGIN,
		"# Continual Harness State",
		"This supplement was produced by validated refinements of earlier work. Follow the prompt notes, treat memories as established facts, and use skills and subagents through their stated contracts.",
	];

	for (const kind of KIND_ORDER) {
		const section = merged.filter(({ entry }) => entry.kind === kind);
		if (section.length === 0) continue;
		lines.push("", `## ${HARNESS_KIND_HEADINGS[kind]}`);
		for (const { entry, layer } of section) {
			lines.push("", `### ${entry.title} (${layer} · ${entry.id} · v${entry.version})`, entry.content);
			if (entry.skill) {
				lines.push(`Invocation: \`${entry.skill.invocation}\``);
				for (const [name, doc] of Object.entries(entry.skill.arguments ?? {}).sort(([left], [right]) =>
					left.localeCompare(right),
				)) {
					lines.push(`- \`${name}\`: ${doc}`);
				}
			}
		}
	}

	const history = [...recentEvents]
		.sort((left, right) => right.revision - left.revision)
		.slice(0, MAX_RENDERED_REFINEMENT_HISTORY);
	if (history.length > 0) {
		lines.push("", "## Recent Refinements");
		for (const event of history) {
			const label = isGlobalScope(event.scope) ? "global" : "subject";
			lines.push(
				`- [${label} rev ${event.revision}] ${event.proposal.summary} (applied ${event.applied.length}, rejected ${event.rejected.length})`,
			);
		}
	}
	lines.push(HARNESS_SUPPLEMENT_END);
	return `${lines.join("\n")}`;
}

export function describeApplied(applied: {
	readonly edit: { readonly action: string };
	readonly entryId: string;
}): string {
	return `${applied.edit.action} ${applied.entryId}`;
}

export function describeRejected(rejected: { readonly edit: HarnessEntryLike; readonly reason: string }): string {
	const id =
		"id" in rejected.edit ? rejected.edit.id : rejected.edit.action === "create" ? rejected.edit.entry.id : undefined;
	return `${id ?? "(unnamed entry)"}: ${rejected.reason}`;
}

type HarnessEntryLike =
	| { readonly action: "create"; readonly entry: { readonly id?: string } }
	| { readonly action: "update"; readonly id: string }
	| { readonly action: "delete"; readonly id: string };

export function formatScopeLabel(state: EvolutionState): string {
	return formatScope(state.scope);
}
