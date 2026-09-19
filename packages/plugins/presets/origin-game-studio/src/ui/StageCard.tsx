import { useTranslation, type PluginCardProps } from "@vetta-org/plugin-sdk";

export function StageCard({ descriptor, pending }: PluginCardProps) {
	const { t } = useTranslation();
	const payload = descriptor.payload as { url?: string; status?: string } | undefined;
	return (
		<div className="rounded-lg border border-border bg-card p-3 text-sm">
			<div className="font-medium">{t("card.stage.title")}</div>
			<p className="text-muted-foreground">
				{pending ? t("card.stage.pending") : payload?.url ? payload.url : (payload?.status ?? t("stage.empty"))}
			</p>
		</div>
	);
}
