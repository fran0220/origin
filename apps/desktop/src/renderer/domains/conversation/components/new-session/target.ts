export type NewSessionTargetKey = string & { readonly __newSessionTargetKey: unique symbol };

export const CONVERSATION_TARGET_KEY = "conversation" as NewSessionTargetKey;

export function agentTargetKey(agentProfileId: string): NewSessionTargetKey {
	return `agent:${agentProfileId}` as NewSessionTargetKey;
}

export function parseAgentTargetKey(value: string | null | undefined): string | null {
	if (!value?.startsWith("agent:")) return null;
	const id = value.slice("agent:".length).trim();
	return id.length > 0 ? id : null;
}

export function parseNewSessionTarget(value: string | null | undefined): NewSessionTargetKey {
	if (!value || value === CONVERSATION_TARGET_KEY) return CONVERSATION_TARGET_KEY;
	return value as NewSessionTargetKey;
}

export interface NewSessionTargetOption {
	readonly targetKey: NewSessionTargetKey;
	readonly title: string;
	readonly subtitle?: string;
	readonly avatarUrls?: readonly string[];
	readonly selected: boolean;
	readonly disabled?: boolean;
}

export function filterTargetOptions(
	options: readonly NewSessionTargetOption[],
	query: string,
): readonly NewSessionTargetOption[] {
	const normalized = query.trim().toLocaleLowerCase();
	if (!normalized) return options;
	return options.filter((option) =>
		`${option.title} ${option.subtitle ?? ""}`.toLocaleLowerCase().includes(normalized),
	);
}
