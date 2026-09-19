export const SPAWN_AGENT_TOOL_DESCRIPTION = [
	"Spawn one in-thread specialist. Prefer explorer for cheap read-only reconnaissance.",
	"Independent implementation work that can proceed without sharing this conversation belongs in create_thread, not here.",
	"Returns immediately with id/path/status; use wait_agent or wait for <subagent_notification>.",
	"Do not use for simple work, ambiguous requests, or a task the root can complete directly with a few tool calls.",
	"Use the structured task contract. Include relevant history, verified current state, one objective, exact scope, constraints, context, deliverables, and functional validation.",
	"",
	"Built-in types: explorer (read-only) and general (inherits parent tools). There is no workflow fleet.",
].join("\n");
