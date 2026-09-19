import {
	HARNESS_ENTRY_KINDS,
	HARNESS_SUPPLEMENT_BEGIN,
	HARNESS_SUPPLEMENT_END,
	MAX_ENTRY_SOURCE_BYTES,
	MAX_HARNESS_ENTRY_CONTENT_BYTES,
	MAX_HARNESS_ENTRY_ID_BYTES,
	MAX_HARNESS_ENTRY_TITLE_BYTES,
	MAX_HARNESS_SKILL_ARGUMENTS,
	MAX_ORIGIN_ID_BYTES,
	MAX_REFINEMENT_EDITS,
	MAX_REFINEMENT_TEXT_BYTES,
	MAX_SKILL_ARGUMENT_DOC_BYTES,
	MAX_SKILL_ARGUMENT_NAME_BYTES,
	MAX_SKILL_INVOCATION_BYTES,
} from "./constants.js";
import { invalidEvolution } from "./errors.js";
import type {
	HarnessCreateEntry,
	HarnessEdit,
	HarnessEntry,
	HarnessEntryKind,
	HarnessEntryPatch,
	HarnessSkillContract,
	RefinementOrigin,
	RefinementProposal,
} from "./types.js";

export function validateText(value: string, maximum: number, name: string, forbidMarkers: boolean): void {
	if (value.trim().length === 0 || value.length > maximum) {
		throw invalidEvolution(`${name} must contain 1..=${maximum} bytes`);
	}
	if (forbidMarkers && (value.includes(HARNESS_SUPPLEMENT_BEGIN) || value.includes(HARNESS_SUPPLEMENT_END))) {
		throw invalidEvolution(`${name} must not contain harness supplement markers`);
	}
}

export function validateEntryId(value: string): void {
	if (value.length === 0 || value.length > MAX_HARNESS_ENTRY_ID_BYTES || !/^[a-z0-9][a-z0-9._-]*$/.test(value)) {
		throw invalidEvolution(
			`entry ID '${value}' must be 1..=${MAX_HARNESS_ENTRY_ID_BYTES} bytes of lowercase letters, digits, '-', '_' or '.' and start with a letter or digit`,
		);
	}
}

export function deriveEntryId(title: string): string {
	let slug = "";
	let pendingSeparator = false;
	for (const character of title) {
		if (/[A-Za-z0-9]/.test(character)) {
			if (pendingSeparator && slug.length > 0) slug += "-";
			pendingSeparator = false;
			slug += character.toLowerCase();
		} else {
			pendingSeparator = true;
		}
		if (slug.length >= MAX_HARNESS_ENTRY_ID_BYTES) break;
	}
	try {
		validateEntryId(slug);
	} catch {
		throw invalidEvolution(`cannot derive an entry ID from title '${title}'`);
	}
	return slug;
}

export function isHarnessEntryKind(value: string): value is HarnessEntryKind {
	return (HARNESS_ENTRY_KINDS as readonly string[]).includes(value);
}

function sortedSkillArguments(skill: HarnessSkillContract): Record<string, string> {
	const entries = Object.entries(skill.arguments ?? {}).sort(([left], [right]) => left.localeCompare(right));
	return Object.fromEntries(entries);
}

export function validateSkillContract(skill: HarnessSkillContract): HarnessSkillContract {
	validateText(skill.invocation, MAX_SKILL_INVOCATION_BYTES, "skill invocation", true);
	const argumentsMap = sortedSkillArguments(skill);
	const names = Object.keys(argumentsMap);
	if (names.length > MAX_HARNESS_SKILL_ARGUMENTS) {
		throw invalidEvolution(
			`skill contract declares ${names.length} arguments; maximum is ${MAX_HARNESS_SKILL_ARGUMENTS}`,
		);
	}
	for (const [name, doc] of Object.entries(argumentsMap)) {
		if (name.length === 0 || name.length > MAX_SKILL_ARGUMENT_NAME_BYTES || !/^[A-Za-z0-9_-]+$/.test(name)) {
			throw invalidEvolution(`invalid skill argument name '${name}'`);
		}
		validateText(doc, MAX_SKILL_ARGUMENT_DOC_BYTES, "skill argument documentation", true);
	}
	return names.length === 0
		? { invocation: skill.invocation }
		: { invocation: skill.invocation, arguments: argumentsMap };
}

export function entryTextBytes(entry: Pick<HarnessEntry, "title" | "content" | "skill">): number {
	const skillBytes = entry.skill
		? entry.skill.invocation.length +
			Object.entries(entry.skill.arguments ?? {}).reduce((sum, [name, doc]) => sum + name.length + doc.length, 0)
		: 0;
	return entry.title.length + entry.content.length + skillBytes;
}

export function normalizeHarnessEntry(entry: HarnessEntry): HarnessEntry {
	validateEntryId(entry.id);
	validateText(entry.title, MAX_HARNESS_ENTRY_TITLE_BYTES, "entry title", true);
	validateText(entry.content, MAX_HARNESS_ENTRY_CONTENT_BYTES, "entry content", true);
	validateText(entry.source, MAX_ENTRY_SOURCE_BYTES, "entry source", true);
	if (!isHarnessEntryKind(entry.kind)) {
		throw invalidEvolution(`unknown harness entry kind '${entry.kind}'`);
	}
	const skill = entry.skill ? validateSkillContract(entry.skill) : undefined;
	if (skill && entry.kind !== "skill") {
		throw invalidEvolution(`a ${entry.kind} entry must not carry a skill contract`);
	}
	if (!skill && entry.kind === "skill") {
		throw invalidEvolution("a skill entry requires a skill contract");
	}
	if (entry.version < 1 || !Number.isInteger(entry.version)) {
		throw invalidEvolution("entry versions start at 1");
	}
	if (!Number.isInteger(entry.createdAtMs) || !Number.isInteger(entry.updatedAtMs)) {
		throw invalidEvolution("entry timestamps must be integers");
	}
	if (entry.updatedAtMs < entry.createdAtMs) {
		throw invalidEvolution("entry update time precedes its creation time");
	}
	return {
		id: entry.id,
		kind: entry.kind,
		title: entry.title,
		content: entry.content,
		...(skill ? { skill } : {}),
		source: entry.source,
		version: entry.version,
		createdAtMs: entry.createdAtMs,
		updatedAtMs: entry.updatedAtMs,
	};
}

export function validateCreateEntry(entry: HarnessCreateEntry): HarnessCreateEntry {
	if (!isHarnessEntryKind(entry.kind)) {
		throw invalidEvolution(`unknown harness entry kind '${entry.kind}'`);
	}
	validateText(entry.title, MAX_HARNESS_ENTRY_TITLE_BYTES, "entry title", true);
	validateText(entry.content, MAX_HARNESS_ENTRY_CONTENT_BYTES, "entry content", true);
	if (entry.id !== undefined) validateEntryId(entry.id);
	const skill = entry.skill ? validateSkillContract(entry.skill) : undefined;
	if (skill && entry.kind !== "skill") {
		throw invalidEvolution(`a ${entry.kind} entry must not carry a skill contract`);
	}
	if (!skill && entry.kind === "skill") {
		throw invalidEvolution("a skill entry requires a skill contract");
	}
	return {
		...(entry.id ? { id: entry.id } : {}),
		kind: entry.kind,
		title: entry.title,
		content: entry.content,
		...(skill ? { skill } : {}),
	};
}

export function validateEntryPatch(patch: HarnessEntryPatch): HarnessEntryPatch {
	if (patch.title === undefined && patch.content === undefined && patch.skill === undefined) {
		throw invalidEvolution("an update edit must change at least one field");
	}
	if (patch.title !== undefined) validateText(patch.title, MAX_HARNESS_ENTRY_TITLE_BYTES, "entry title", true);
	if (patch.content !== undefined) {
		validateText(patch.content, MAX_HARNESS_ENTRY_CONTENT_BYTES, "entry content", true);
	}
	const skill = patch.skill ? validateSkillContract(patch.skill) : undefined;
	return {
		...(patch.title !== undefined ? { title: patch.title } : {}),
		...(patch.content !== undefined ? { content: patch.content } : {}),
		...(skill ? { skill } : {}),
	};
}

export function validateEdit(edit: HarnessEdit): HarnessEdit {
	switch (edit.action) {
		case "create":
			return { action: "create", entry: validateCreateEntry(edit.entry) };
		case "update": {
			validateEntryId(edit.id);
			if (!Number.isInteger(edit.expectedVersion) || edit.expectedVersion < 1) {
				throw invalidEvolution("expectedVersion must be an integer >= 1");
			}
			return {
				action: "update",
				id: edit.id,
				expectedVersion: edit.expectedVersion,
				patch: validateEntryPatch(edit.patch),
			};
		}
		case "delete": {
			validateEntryId(edit.id);
			if (!Number.isInteger(edit.expectedVersion) || edit.expectedVersion < 1) {
				throw invalidEvolution("expectedVersion must be an integer >= 1");
			}
			return { action: "delete", id: edit.id, expectedVersion: edit.expectedVersion };
		}
	}
}

export function validateProposal(proposal: RefinementProposal): RefinementProposal {
	validateText(proposal.summary, MAX_REFINEMENT_TEXT_BYTES, "proposal summary", true);
	validateText(proposal.rationale, MAX_REFINEMENT_TEXT_BYTES, "proposal rationale", true);
	validateText(proposal.expectedOutcome, MAX_REFINEMENT_TEXT_BYTES, "proposal expected outcome", true);
	if (proposal.edits.length === 0 || proposal.edits.length > MAX_REFINEMENT_EDITS) {
		throw invalidEvolution(`a proposal must contain 1..=${MAX_REFINEMENT_EDITS} edits`);
	}
	return {
		summary: proposal.summary,
		rationale: proposal.rationale,
		expectedOutcome: proposal.expectedOutcome,
		edits: proposal.edits.map(validateEdit),
	};
}

export function validateOrigin(origin: RefinementOrigin): RefinementOrigin {
	validateText(origin.sessionId, MAX_ORIGIN_ID_BYTES, "origin session id", true);
	validateText(origin.turnId, MAX_ORIGIN_ID_BYTES, "origin turn id", true);
	validateText(origin.toolCallId, MAX_ORIGIN_ID_BYTES, "origin tool call id", true);
	return {
		sessionId: origin.sessionId,
		turnId: origin.turnId,
		toolCallId: origin.toolCallId,
	};
}
