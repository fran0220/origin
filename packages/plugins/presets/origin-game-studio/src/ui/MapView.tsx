import { useTranslation } from "@origin-org/plugin-sdk";

export function MapView() {
	const { t } = useTranslation();
	return (
		<div className="origin-game-studio-shell flex h-full flex-col gap-4 p-6">
			<header>
				<h1 className="text-lg font-medium">{t("map.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("map.subtitle")}</p>
			</header>
			<section className="rounded-lg border border-border bg-card p-4 text-sm">{t("map.empty")}</section>
		</div>
	);
}
