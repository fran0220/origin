import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import {
	type EvolutionLedger,
	type EvolutionScope,
	HOME_SUBJECT_ID,
	HOST_ORIGIN,
	isLedgerRefusal,
	listEntries,
	REFINEMENT_SOURCE,
	type RefinementOrigin,
	type RefinementOutcome,
	type RefinementProposal,
	subjectScope,
} from "@vetta/runtime-evolution";
import { ToolCallDescriptionSchema } from "@vetta/runtime-tools/coding";

export const HARNESS_REFINE_TOOL_NAME = "harness_refine";
export const HARNESS_LIST_TOOL_NAME = "harness_list";
export const HARNESS_ROLLBACK_TOOL_NAME = "harness_rollback";
export const HARNESS_PROMOTE_TOOL_NAME = "harness_promote";

const HarnessKindSchema = Type.Union([
	Type.Literal("prompt"),
	Type.Literal("memory"),
	Type.Literal("skill"),
	Type.Literal("subagent"),
]);

const SkillContractSchema = Type.Object(
	{
		invocation: Type.String({ minLength: 1, description: "How to invoke an already-available skill or tool." }),
		arguments: Type.Optional(Type.Record(Type.String(), Type.String())),
	},
	{ additionalProperties: false },
);

const CreateEditSchema = Type.Object(
	{
		action: Type.Literal("create"),
		entry: Type.Object(
			{
				id: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
				kind: HarnessKindSchema,
				title: Type.String({ minLength: 1, maxLength: 256 }),
				content: Type.String({ minLength: 1, maxLength: 65536 }),
				skill: Type.Optional(SkillContractSchema),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);

const UpdateEditSchema = Type.Object(
	{
		action: Type.Literal("update"),
		id: Type.String({ minLength: 1, maxLength: 128 }),
		expectedVersion: Type.Integer({ minimum: 1 }),
		patch: Type.Object(
			{
				title: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
				content: Type.Optional(Type.String({ minLength: 1, maxLength: 65536 })),
				skill: Type.Optional(SkillContractSchema),
			},
			{ additionalProperties: false },
		),
	},
	{ additionalProperties: false },
);

const DeleteEditSchema = Type.Object(
	{
		action: Type.Literal("delete"),
		id: Type.String({ minLength: 1, maxLength: 128 }),
		expectedVersion: Type.Integer({ minimum: 1 }),
	},
	{ additionalProperties: false },
);

export const HarnessRefineInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	summary: Type.String({
		minLength: 1,
		maxLength: 4096,
		description: "One-line description of what this refinement records.",
	}),
	rationale: Type.String({
		minLength: 1,
		maxLength: 4096,
		description: "Why the work taught this, citing concrete evidence from this Turn.",
	}),
	expectedOutcome: Type.String({
		minLength: 1,
		maxLength: 4096,
		description: "What later Turns should do differently once this lands.",
	}),
	edits: Type.Array(Type.Union([CreateEditSchema, UpdateEditSchema, DeleteEditSchema]), {
		minItems: 1,
		maxItems: 32,
		description:
			"Isolated edits against this subject's ledger. Invalid edits are rejected with reasons; valid ones land.",
	}),
});

export const HarnessListInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	layer: Type.Optional(
		Type.Union([Type.Literal("subject"), Type.Literal("global"), Type.Literal("both")], {
			description: "Which layer to list. Default both.",
		}),
	),
});

export const HarnessRollbackInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	digest: Type.String({ minLength: 1, description: "Digest of the applied event to reverse as a whole." }),
	reason: Type.String({ minLength: 1, maxLength: 4096, description: "Why this change is being taken back." }),
});

export const HarnessPromoteInputSchema = Type.Object({
	description: ToolCallDescriptionSchema,
	entryId: Type.String({
		minLength: 1,
		maxLength: 128,
		description: "Subject entry to copy into the shared baseline.",
	}),
});

export type HarnessRefineInput = Static<typeof HarnessRefineInputSchema>;
export type HarnessListInput = Static<typeof HarnessListInputSchema>;
export type HarnessRollbackInput = Static<typeof HarnessRollbackInputSchema>;
export type HarnessPromoteInput = Static<typeof HarnessPromoteInputSchema>;

export interface HarnessToolHost {
	readonly ledger: EvolutionLedger;
	readonly subject: EvolutionScope;
	readonly now: () => number;
}

function originOf(request: { sessionId: string; turnId: string; toolCallId: string }): RefinementOrigin {
	return {
		sessionId: request.sessionId,
		turnId: request.turnId,
		toolCallId: request.toolCallId,
	};
}

function formatOutcome(outcome: RefinementOutcome): string {
	const applied = outcome.applied.map((item) => `${item.edit.action} ${item.entryId}`);
	const rejected = outcome.rejected.map((item) => {
		const id = item.edit.action === "create" ? (item.edit.entry.id ?? "(unnamed entry)") : item.edit.id;
		return `${id}: ${item.reason}`;
	});
	return JSON.stringify(
		{
			revision: outcome.revision,
			digest: outcome.digest,
			applied,
			rejected,
		},
		null,
		2,
	);
}

function toolError(error: unknown): never {
	if (isLedgerRefusal(error)) {
		throw new Error(error.message);
	}
	throw new Error(error instanceof Error ? error.message : String(error));
}

export const HARNESS_REFINE_DESCRIPTION =
	"Write what this Project or Home assistant's work has taught into its continual-harness ledger, which every later Turn by that subject starts from. Call this when work establishes something durable — a build invariant, a convention that held, a capability worth naming — not for one-off detail. The entries in effect, with their ids and versions, are already in your Continual Harness State section: update one instead of creating a near-duplicate, and copy its version into expectedVersion. skill/subagent edits are prompt-level routing notes for already-available capabilities; they do not register new tools. What the ledger accepts takes effect at the next Turn admission, so say in your answer what you recorded. Partial application is reported honestly: applied edits land beside rejected edits and their reasons.";

export const HARNESS_LIST_DESCRIPTION =
	"List the current continual-harness entries for this subject and/or the shared global baseline, including ids and versions needed for harness_refine updates.";

export const HARNESS_ROLLBACK_DESCRIPTION =
	"Take one whole applied harness refinement back. This is all-or-nothing: if an entry it touched has moved since, the ledger refuses rather than merging. The reversal is itself a new event.";

export const HARNESS_PROMOTE_DESCRIPTION =
	"Copy one of this subject's ledger entries up into the shared baseline every subject inherits. Use it only for something that held beyond this Project or Home assistant, and call it on its own: it is a decision about a different scope and never rides along with the refinement that produced the entry. The owning ledger keeps its own copy.";

export function createHarnessRefineTool(host: HarnessToolHost): RuntimeToolDefinition<HarnessRefineInput> {
	return {
		name: HARNESS_REFINE_TOOL_NAME,
		label: "Harness refine",
		description: HARNESS_REFINE_DESCRIPTION,
		inputSchema: HarnessRefineInputSchema,
		async execute({ input, sessionId, turnId, toolCallId }) {
			const proposal: RefinementProposal = {
				summary: input.summary,
				rationale: input.rationale,
				expectedOutcome: input.expectedOutcome,
				edits: input.edits,
			};
			try {
				const outcome = await host.ledger.record(
					host.subject,
					proposal,
					REFINEMENT_SOURCE,
					originOf({ sessionId, turnId, toolCallId }),
					host.now(),
				);
				return { content: [{ type: "text", text: formatOutcome(outcome) }], details: outcome };
			} catch (error) {
				toolError(error);
			}
		},
	};
}

export function createHarnessListTool(host: HarnessToolHost): RuntimeToolDefinition<HarnessListInput> {
	return {
		name: HARNESS_LIST_TOOL_NAME,
		label: "Harness list",
		description: HARNESS_LIST_DESCRIPTION,
		inputSchema: HarnessListInputSchema,
		async execute({ input }) {
			try {
				const layer = input.layer ?? "both";
				const subjectState = await host.ledger.state(host.subject);
				const globalState = layer === "subject" ? null : await host.ledger.state({ kind: "global" });
				const format = (state: typeof subjectState) =>
					listEntries(state).map((entry) => ({
						id: entry.id,
						kind: entry.kind,
						title: entry.title,
						content: entry.content,
						version: entry.version,
						source: entry.source,
					}));
				const payload = {
					subjectId: host.subject.kind === "subject" ? host.subject.subjectId : HOME_SUBJECT_ID,
					subjectRevision: subjectState.revision,
					globalRevision: globalState?.revision ?? 0,
					subject: layer === "global" ? [] : format(subjectState),
					global: globalState && layer !== "subject" ? format(globalState) : [],
				};
				return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], details: payload };
			} catch (error) {
				toolError(error);
			}
		},
	};
}

export function createHarnessRollbackTool(host: HarnessToolHost): RuntimeToolDefinition<HarnessRollbackInput> {
	return {
		name: HARNESS_ROLLBACK_TOOL_NAME,
		label: "Harness rollback",
		description: HARNESS_ROLLBACK_DESCRIPTION,
		inputSchema: HarnessRollbackInputSchema,
		async execute({ input, sessionId, turnId, toolCallId }) {
			try {
				const outcome = await host.ledger.rollback(
					host.subject,
					input.digest,
					input.reason,
					originOf({ sessionId, turnId, toolCallId }),
					host.now(),
				);
				return { content: [{ type: "text", text: formatOutcome(outcome) }], details: outcome };
			} catch (error) {
				toolError(error);
			}
		},
	};
}

export function createHarnessPromoteTool(host: HarnessToolHost): RuntimeToolDefinition<HarnessPromoteInput> {
	return {
		name: HARNESS_PROMOTE_TOOL_NAME,
		label: "Harness promote",
		description: HARNESS_PROMOTE_DESCRIPTION,
		inputSchema: HarnessPromoteInputSchema,
		async execute({ input, sessionId, turnId, toolCallId }) {
			try {
				const outcome = await host.ledger.promote(
					host.subject,
					input.entryId,
					originOf({ sessionId, turnId, toolCallId }),
					host.now(),
				);
				return { content: [{ type: "text", text: formatOutcome(outcome) }], details: outcome };
			} catch (error) {
				toolError(error);
			}
		},
	};
}

export function resolveHarnessSubject(subjectId: string): EvolutionScope {
	return subjectScope(subjectId);
}

export { type RefinementProposalSchema, HOST_ORIGIN };
