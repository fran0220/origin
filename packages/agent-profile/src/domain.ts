import type { AgentProfile, AgentProfileDocument } from "./contracts.js";

export function normalizeMentionHandle(value: string): string {
	return value.normalize("NFKC").trim().replace(/^@+/, "").toLocaleLowerCase("en-US");
}

export function listLibraryAgentProfiles(document: Pick<AgentProfileDocument, "agents">): readonly AgentProfile[] {
	return document.agents;
}
