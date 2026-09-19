import { confirmDialogAtom } from "@shared/store/atoms";
import { useOwnedHeaderTitleHidden } from "@shared/hooks/useOwnedHeaderTitleHidden";
import { useSurfaceActive } from "@shared/surface-active";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { notifyAgentProfileConfigurationChanged } from "@shared/agent-profiles/team-session-events";
import { useAgentCenterModel } from "../hooks/useAgentCenterModel";
import { AgentCenterView } from "./AgentCenterView";
import { AgentProfileSheet } from "./AgentProfileSheet";

/**
 * 侧栏「智能体」入口页：智能体库。档案抽屉由 `?agent=` 驱动，Esc 与返回键就是关闭。
 */
export function AgentCenterPage(): JSX.Element {
	const { t } = useTranslation("agent-profiles");
	const confirm = useSetAtom(confirmDialogAtom);
	useOwnedHeaderTitleHidden(useSurfaceActive());
	const navigate = useNavigate();
	const { agent: agentParam } = useSearch({ strict: false }) as { agent?: string };
	const model = useAgentCenterModel({
		defaultName: t("library.defaultAgentName"),
		defaultDescription: t("library.defaultAgentDescription"),
	});

	const openAgent = useCallback(
		(agentId: string) => void navigate({ to: "/agents", search: { agent: agentId }, replace: true }),
		[navigate],
	);
	const closeSheets = useCallback(() => void navigate({ to: "/agents", search: {}, replace: true }), [navigate]);

	const [agentMounted, setAgentMounted] = useState(agentParam !== undefined);
	useEffect(() => {
		if (agentParam !== undefined) setAgentMounted(true);
	}, [agentParam]);

	const sheetAgent = agentParam && agentParam !== "new" ? model.findAgent(agentParam) : undefined;

	async function requestDeleteAgent(): Promise<void> {
		if (!sheetAgent) return;
		confirm({
			title: t("library.deleteTitle"),
			message: t("library.deleteMessage", { name: sheetAgent.name }),
			confirmLabel: t("library.delete"),
			variant: "danger",
			onConfirm: () => {
				void model.actions.deleteAgent(sheetAgent).then((deleted) => {
					if (!deleted) return;
					closeSheets();
					notifyAgentProfileConfigurationChanged();
				});
			},
		});
	}

	if (model.error && !model.document) {
		return (
			<div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
				<div className="relative shrink-0 px-8 pb-4 pt-5">
					<h1 className="text-[26px] font-semibold leading-tight tracking-tight text-foreground">{t("center.title")}</h1>
					<p className="mt-4 text-[13px] text-destructive">{t("error.load", { error: model.error })}</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<AgentCenterView model={model} onOpenAgent={openAgent} onCreateAgent={() => void navigate({ to: "/agents", search: { agent: "new" }, replace: true })} />

			{(agentMounted || agentParam !== undefined) && (
				<AgentProfileSheet
					open={agentParam !== undefined}
					mode={agentParam === "new" ? "create" : "edit"}
					agent={sheetAgent}
					blueprints={model.blueprints}
					plugins={model.plugins}
					capabilities={model.capabilities}
					onClose={closeSheets}
					onExited={() => {
						if (agentParam === undefined) setAgentMounted(false);
					}}
					onSaved={notifyAgentProfileConfigurationChanged}
					onSave={model.actions.saveAgent}
					onCreate={model.actions.createAgentFromDraft}
					{...(sheetAgent?.source ? {} : { onDelete: () => void requestDeleteAgent() })}
				/>
			)}
		</>
	);
}
