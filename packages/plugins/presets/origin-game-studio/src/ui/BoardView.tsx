import { useTranslation } from "@vetta-org/plugin-sdk";
import { useEffect, useState } from "react";
import { GRAPH_FILE } from "../ids";
import { getPluginCtx } from "../plugin-context";
import { loadProject } from "../store/project-store";

export function BoardView() {
	const { t } = useTranslation();
	const [summary, setSummary] = useState<string>(t("board.loading"));

	useEffect(() => {
		let cancelled = false;
		const ctx = getPluginCtx();
		const unsubscribe = ctx.conversation.on((event) => {
			if (event.type !== "conversation-changed" || !event.conversation.cwd) return;
			const cwd = event.conversation.cwd;
			void Promise.all([loadProject(ctx.storage, cwd), ctx.fs.readFile(`${cwd}/${GRAPH_FILE}`).catch(() => null)]).then(
				([project, graph]) => {
					if (cancelled) return;
					setSummary(
						t("board.summary", {
							name: project.name,
							substrate: project.substrate ?? t("board.substrateUnknown"),
							hasGraph: graph ? t("board.graphPresent") : t("board.graphMissing"),
						}),
					);
				},
			);
		});
		return () => {
			cancelled = true;
			unsubscribe.dispose();
		};
	}, [t]);

	return (
		<div className="origin-game-studio-shell flex h-full flex-col gap-4 p-6">
			<header>
				<h1 className="text-lg font-medium">{t("board.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("board.subtitle")}</p>
			</header>
			<section className="rounded-lg border border-border bg-card p-4 text-sm">{summary}</section>
		</div>
	);
}
