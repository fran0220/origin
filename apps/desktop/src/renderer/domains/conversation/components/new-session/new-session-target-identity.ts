import type { AgentProfile, AgentProfileDocument } from "@origin/agent-team";
import type { NewSessionHeroAvatar, NewSessionHeroIdentity } from "@origin-org/theme-ui";
import { agentAvatarUrl } from "@shared/agent-teams/agent-avatar";
import { parseAgentTargetKey } from "./target";

export interface NewSessionTargetIdentityLabels {
	readonly memberCount: (count: number) => string;
}

/** 解析档案头像；缺省只认用户自己挑的图，提供方那张要靠调用方传解析器进来。 */
export type NewSessionAvatarResolver = (subject: {
	readonly id: string;
	readonly blueprintId: string;
	readonly avatar?: string;
}) => string;

/**
 * 把选中的会话对象解析成 hero 身份。
 *
 * 目标档案可能已被删除（URL 里带着旧 target 进来，或另一个窗口刚删掉它），
 * 这时返回 null 让 hero 回到问候语，而不是显示一个空壳身份。
 */
export function resolveNewSessionTargetIdentity(
	document: AgentProfileDocument | undefined,
	targetKey: string | null,
	_labels: NewSessionTargetIdentityLabels,
	resolveAvatar: NewSessionAvatarResolver = agentAvatarUrl,
): NewSessionHeroIdentity | null {
	if (!document || !targetKey) return null;

	const agentId = parseAgentTargetKey(targetKey);
	if (agentId) {
		const agent = document.agents.find((candidate) => candidate.id === agentId);
		if (!agent) return null;
		return {
			avatars: [heroAvatar(agent, agent.id, resolveAvatar)],
			key: targetKey,
			subtitle: agent.description.trim(),
			title: agent.name,
		};
	}

	return null;
}

function heroAvatar(
	profile: AgentProfile | undefined,
	fallbackId: string,
	resolveAvatar: NewSessionAvatarResolver,
): NewSessionHeroAvatar {
	return {
		avatar: resolveAvatar({
			id: profile?.id ?? fallbackId,
			blueprintId: profile?.blueprintId ?? "",
			...(profile?.avatar ? { avatar: profile.avatar } : {}),
		}),
		...(profile?.blueprintId ? { blueprintId: profile.blueprintId } : {}),
		name: profile?.name ?? fallbackId,
	};
}
