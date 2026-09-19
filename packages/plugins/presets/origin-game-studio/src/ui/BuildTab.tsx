import { useTranslation } from "@vetta-org/plugin-sdk";
import { useEffect, useState } from "react";
import { loadMilestoneLedger } from "../milestones/store";
import { getPluginCtx } from "../plugin-context";
import { loadProject, type BuildSnapshot } from "../store/project-store";

export function BuildTab() {
	const { t } = useTranslation();
	const [build, setBuild] = useState<BuildSnapshot | null>(null);
	const [milestones, setMilestones] = useState<string[]>([]);

	useEffect(() => {
		const ctx = getPluginCtx();
		const unsubscribe = ctx.conversation.on((event) => {
			if (event.type !== "conversation-changed" || !event.conversation.cwd) return;
			const cwd = event.conversation.cwd;
			void Promise.all([loadProject(ctx.storage, cwd), loadMilestoneLedger(ctx.storage, cwd)]).then(
				([project, ledger]) => {
					setBuild(project.build);
					setMilestones(ledger.definitions.map((definition) => definition.title));
				},
			);
		});
		return () => unsubscribe.dispose();
	}, []);

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<h2 className="text-sm font-medium">{t("tab.build")}</h2>
			<p className="text-sm text-muted-foreground">{t("build.status", { status: build?.status ?? "idle" })}</p>
			<ul className="list-disc pl-4 text-sm">
				{milestones.map((title) => (
					<li key={title}>{title}</li>
				))}
			</ul>
		</div>
	);
}
