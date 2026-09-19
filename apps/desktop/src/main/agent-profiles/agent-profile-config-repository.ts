import type { AgentProfileDocument } from "@origin/agent-profile";
import { createAgentProfileFileRepository } from "./agent-profile-file-repository.js";

export interface AgentProfileConfigRepository {
	read(): Promise<AgentProfileDocument>;
	write(document: AgentProfileDocument): Promise<void>;
}

export function createAgentProfileConfigRepository(): AgentProfileConfigRepository {
	return createAgentProfileFileRepository();
}
