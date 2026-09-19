import type { AgentProfileDocument } from "@origin/agent-team";
import { createAgentTeamFileRepository } from "./agent-team-file-repository.js";

export interface AgentTeamConfigRepository {
	read(): Promise<AgentProfileDocument>;
	write(document: AgentProfileDocument): Promise<void>;
}

export function createAgentTeamConfigRepository(): AgentTeamConfigRepository {
	return createAgentTeamFileRepository();
}
