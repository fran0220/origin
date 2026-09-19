import { useTranslation } from "@origin-org/plugin-sdk";
import { useEffect, useState } from "react";
import { GRAPH_FILE } from "../ids";
import { getPluginCtx } from "../plugin-context";

export function GraphTab() {
	const { t } = useTranslation();
	const [text, setText] = useState<string>(t("graph.empty"));

	useEffect(() => {
		const ctx = getPluginCtx();
		const unsubscribe = ctx.conversation.on((event) => {
			if (event.type !== "conversation-changed" || !event.conversation.cwd) return;
			void ctx.fs
				.readFile(`${event.conversation.cwd}/${GRAPH_FILE}`)
				.then((file) => setText(file.content))
				.catch(() => setText(t("graph.empty")));
		});
		return () => unsubscribe.dispose();
	}, [t]);

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<h2 className="text-sm font-medium">{t("tab.graph")}</h2>
			<pre className="overflow-auto rounded border border-border bg-card p-3 text-xs whitespace-pre-wrap">{text}</pre>
		</div>
	);
}
