import { useTranslation, type PluginCardProps } from "@origin-org/plugin-sdk";

export function BuildCard({ descriptor, pending }: PluginCardProps) {
	const { t } = useTranslation();
	const payload = descriptor.payload as { revision?: string } | undefined;
	return (
		<div className="rounded-lg border border-border bg-card p-3 text-sm">
			<div className="font-medium">{t("card.build.title")}</div>
			<p className="text-muted-foreground">
				{pending ? t("card.build.pending") : (payload?.revision ?? t("build.empty"))}
			</p>
		</div>
	);
}
