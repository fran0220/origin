import type { SessionInfo } from "@shared/store/atoms";

export type SidebarConversationInfo = { readonly kind: "conversation" } & SessionInfo;

export type SidebarConversationPlacement =
	| { readonly kind: "default" }
	| { readonly kind: "project"; readonly projectPath: string };

export interface SidebarConversationIdentity {
	readonly key: string;
	readonly label: string;
	readonly iconClassName?: string;
	readonly trailingAvatarUrls?: readonly string[];
	readonly mutable: boolean;
	readonly titleExtra?: string;
}

export interface SidebarConversationIdentityLabels {
	readonly conversationLabel?: string;
}

export function projectSidebarConversations(
	ordinarySessions: readonly SessionInfo[],
	_placement: SidebarConversationPlacement,
): SidebarConversationInfo[] {
	return ordinarySessions
		.map((session): SidebarConversationInfo => ({ ...session, kind: "conversation" }))
		.sort((left, right) => right.modifiedAt - left.modifiedAt);
}

export function sidebarConversationKey(session: SidebarConversationInfo): string {
	return `conversation:${session.path}`;
}

/** Keeps source-specific identity rules out of the list components. */
export function sidebarConversationIdentity(
	session: SidebarConversationInfo,
	labels: SidebarConversationIdentityLabels,
): SidebarConversationIdentity {
	return {
		key: sidebarConversationKey(session),
		label: labels.conversationLabel ?? session.firstMessage,
		mutable: true,
	};
}

export function isSidebarConversationActive(session: SidebarConversationInfo, activeSessionPath: string): boolean {
	return session.kind === "conversation" && activeSessionPath === session.path;
}
