import { useTranslation } from "@vetta-org/plugin-sdk";
import { readHostCapabilities } from "../adapters/host-capabilities";
import { getPluginCtx } from "../plugin-context";

export function RecordingsTab() {
	const { t } = useTranslation();
	const recording = readHostCapabilities(getPluginCtx()).recording;
	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<h2 className="text-sm font-medium">{t("tab.recordings")}</h2>
			{recording ? (
				<p className="text-sm">{t("recordings.ready")}</p>
			) : (
				<div role="status" className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
					{t("recordings.waiting")}
				</div>
			)}
		</div>
	);
}
