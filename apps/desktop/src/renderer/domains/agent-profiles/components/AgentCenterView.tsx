import { Button } from "@origin-org/ui";
import { useTranslation } from "react-i18next";
import type { AgentCenterModel } from "../hooks/useAgentCenterModel";
import { AgentCard } from "./AgentCard";
import { AgentCenterHero } from "./agent-center/AgentCenterHero";

export interface AgentCenterViewProps {
	readonly model: AgentCenterModel;
	readonly onOpenAgent: (agentId: string) => void;
	readonly onCreateAgent: () => void;
}

export function AgentCenterView({ model, onOpenAgent, onCreateAgent }: AgentCenterViewProps): JSX.Element {
	const { t } = useTranslation("agent-profiles");

	return (
		<div className="@container relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-8 @md:px-8 [scrollbar-gutter:stable]">
				<AgentCenterHero agents={model.agents} />

				{model.error && (
					<div aria-live="polite" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
						{model.error}
					</div>
				)}

				<section className="flex flex-col gap-3.5">
					<div className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-baseline gap-3">
							<h2 className="text-[15px] font-semibold tracking-tight text-foreground">{t("center.agentsSection")}</h2>
							<span className="truncate text-[12px] text-muted-foreground">
								{t("center.agentsHint", { count: model.agents.length })}
							</span>
						</div>
						<Button
							variant="outline"
							size="sm"
							className="h-7 shrink-0 gap-1.5 text-[12px]"
							onClick={onCreateAgent}
						>
							<span className="icon-[solar--add-circle-linear] h-3.5 w-3.5" aria-hidden="true" />
							{t("center.createAgent")}
						</Button>
					</div>

					{model.agents.length === 0 ? (
						<p className="rounded-xl border border-dashed border-border/50 px-4 py-8 text-center text-[12px] text-muted-foreground">
							{t("library.empty")}
						</p>
					) : (
						<div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
							{model.agents.map((agent) => (
								<AgentCard
									key={agent.id}
									agent={agent}
									blueprint={model.blueprints.find((candidate) => candidate.id === agent.blueprintId)}
									plugins={model.plugins}
									onActivate={() => onOpenAgent(agent.id)}
								/>
							))}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
