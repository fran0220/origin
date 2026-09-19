import type { AgentProfile } from "@origin/agent-profile";
import type { TFunction } from "i18next";

/** Names and descriptions are persisted profile data, not localization keys. */
export function agentDisplayName(profile: AgentProfile, _t: TFunction<"agent-profiles">): string {
	return profile.name;
}

export function agentDisplayDescription(profile: AgentProfile, _t: TFunction<"agent-profiles">): string {
	return profile.description;
}
