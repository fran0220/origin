import { useTranslation } from "@origin-org/plugin-sdk";
import { useEffect, useState } from "react";
import { getPluginCtx } from "../plugin-context";
import { getDevServer } from "../stage/dev-server";
import { loadProject, type StageSnapshot } from "../store/project-store";

export function StageTab() {
	const { t } = useTranslation();
	const [stage, setStage] = useState<StageSnapshot | null>(null);

	useEffect(() => {
		const ctx = getPluginCtx();
		const unsubscribe = ctx.conversation.on((event) => {
			if (event.type !== "conversation-changed" || !event.conversation.cwd) return;
			const cwd = event.conversation.cwd;
			void loadProject(ctx.storage, cwd).then((project) => {
				const live = getDevServer(cwd);
				setStage(
					live
						? { ...project.stage, running: true, url: live.url, port: live.port }
						: project.stage,
				);
			});
		});
		return () => unsubscribe.dispose();
	}, []);

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<h2 className="text-sm font-medium">{t("tab.stage")}</h2>
			{stage?.running && stage.url ? (
				<iframe title={t("tab.stage")} src={stage.url} className="h-full w-full rounded border border-border bg-black" />
			) : (
				<p className="text-sm text-muted-foreground">{t("stage.empty")}</p>
			)}
		</div>
	);
}
