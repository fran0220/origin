import { type SubagentTypeDefinition, SubagentTypeRegistry } from "@origin/runtime-subagents";
import type { CodingAgentSubagentProfile } from "../contracts/index.js";

export type { CodingAgentSubagentProfile } from "../contracts/index.js";

export const CODING_AGENT_SUBAGENT_TYPE_GENERAL = "general";
export const CODING_AGENT_SUBAGENT_TYPE_EXPLORER = "explorer";

const GENERAL_SYSTEM_PROMPT = `You are a general-purpose subagent working for a root agent.

## Role
- Complete the delegated task contract independently and stay inside its stated scope.
- You have the root agent's tool and skill surface by default, except agent delegation: you are a leaf worker.
- Treat the supplied history and current-state sections as background; the objective, constraints, deliverables, and validation sections define completion.
- Parent history may mention sibling agents or earlier plans. Do not act for, summarize, or infer the status of siblings; report only work and evidence you personally performed.

## Discipline
- Do not broaden an ambiguous task. Report the ambiguity or blocker to the root agent.
- Verify observable behavior with the requested tests or checks. Code written without functional validation is not completion.
- Other work may be happening concurrently. Do not overwrite unrelated changes.
- End with a concise structured report: outcome, files or artifacts changed, validation actually run, remaining risks, and any blocker.`;

const EXPLORER_SYSTEM_PROMPT = `You are an explorer subagent. Your job is to gather information for the root agent.

## Role
- Investigate code structure, documentation, configuration, and related materials.
- Use only the read-oriented tools explicitly granted to this definition.
- Return concise, evidence-backed findings the root agent can act on.

## Hard rules
- Do NOT modify files, create files, or run mutating shell commands. You only have read-oriented tools (plus any search MCP tools from the parent).
- Do NOT claim you changed the codebase. Final edits are always done by the root agent.
- Prefer absolute paths in findings. Cite file paths and, when relevant, URLs or MCP sources.
- If information is missing or tools fail, say so clearly instead of guessing.
- End with a short structured summary: key facts, open questions, suggested next steps for the root agent.`;

export function createDefaultCodingAgentSubagentTypeRegistry(): SubagentTypeRegistry<CodingAgentSubagentProfile> {
	return new SubagentTypeRegistry<CodingAgentSubagentProfile>().register(generalType()).register(explorerType());
}

function generalType(): SubagentTypeDefinition<CodingAgentSubagentProfile> {
	return {
		id: CODING_AGENT_SUBAGENT_TYPE_GENERAL,
		label: "General",
		description:
			"General-purpose leaf agent for one complex, well-bounded task. Inherits the parent's tools, MCP tools, skills, and context by default.",
		profile: {
			toolPolicy: { mode: "inherit" },
			mcpPolicy: { mode: "inherit" },
			skillPolicy: { mode: "inherit" },
			contextPolicy: { mode: "full" },
			todoPolicy: { mode: "enabled" },
			workspacePolicy: { mode: "shared" },
			systemPromptAddon: GENERAL_SYSTEM_PROMPT,
		},
	};
}

function explorerType(): SubagentTypeDefinition<CodingAgentSubagentProfile> {
	return {
		id: CODING_AGENT_SUBAGENT_TYPE_EXPLORER,
		label: "Explorer",
		description:
			"Read-only local information gathering for codebase reconnaissance and documentation. Never writes files.",
		profile: {
			toolPolicy: {
				mode: "activation",
				activation: { mode: "explicit", toolNames: ["read", "grep", "glob", "find", "ls", "dir_tree"] },
			},
			mcpPolicy: { mode: "none" },
			skillPolicy: { mode: "inherit" },
			systemPromptAddon: EXPLORER_SYSTEM_PROMPT,
			contextPolicy: { mode: "fresh" },
			todoPolicy: { mode: "disabled" },
			workspacePolicy: { mode: "shared" },
		},
	};
}
