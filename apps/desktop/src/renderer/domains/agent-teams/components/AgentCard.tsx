import { agentAvatarUrl } from "@shared/agent-teams/agent-avatar";
import type { AgentBlueprint, AgentProfile } from "@vetta/agent-team";
import { agentUnavailableReason, type BlueprintDisplayPlugin } from "../lib/blueprint-display";
import { useTranslation } from "react-i18next";
import { AgentAvatarView } from "@vetta-org/theme-ui/chat";

export interface AgentCardProps {
	readonly agent: AgentProfile;
	readonly blueprint?: AgentBlueprint;
	/** 用于说清楚「档案为什么不可用」。 */
	readonly plugins?: readonly BlueprintDisplayPlugin[];
	readonly selected?: boolean;
	readonly onActivate: () => void;
}

/** 智能体卡片：智能体中心列出档案。 */
export function AgentCard({
	agent,
	blueprint,
	plugins,
	selected = false,
	onActivate,
}: AgentCardProps): JSX.Element {
	const { t, i18n } = useTranslation("agent-teams");
	const unavailable = agentUnavailableReason(agent, blueprint, plugins, i18n.language);

	return (
		<div
			className={[
				"group relative rounded-xl border transition-colors duration-200",
				// 插件被禁用时档案灰着留在原地，重新启用就恢复。
				unavailable ? "opacity-60" : "",
				selected
					? "border-primary/40 bg-primary/10 ring-1 ring-inset ring-primary/30"
					: "border-border/50 bg-card/40 hover:border-primary/40 hover:bg-card/60",
			].join(" ")}
		>
			<button
				type="button"
				onClick={onActivate}
				aria-label={agent.name}
				className="flex w-full cursor-pointer items-start gap-3.5 p-4 text-left outline-none"
			>
				<AgentAvatarView
					name={agent.name}
					avatar={agentAvatarUrl(agent, blueprint)}
					size="hero"
				/>

				<span className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-[14px] font-semibold tracking-tight text-foreground">{agent.name}</span>
					<span className="mt-1.5 line-clamp-2 min-h-9 text-[12px] leading-relaxed text-muted-foreground/80">
						{agent.description || t("library.defaultAgentDescription")}
					</span>
					{unavailable && (
						<span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
							<span className="icon-[solar--plug-circle-linear] h-3 w-3" aria-hidden="true" />
							{t("library.pluginDisabled", { plugin: unavailable.pluginName })}
						</span>
					)}
				</span>
			</button>
		</div>
	);
}
