import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type HarnessLedgerModel, useHarnessLedgerModel, useHarnessSettingsLabels } from "./useHarnessLedgerModel";

export interface HarnessSettingsModel {
	readonly description: string;
	readonly ledger: HarnessLedgerModel;
	readonly title: string;
}

export function useHarnessSettingsModel(): HarnessSettingsModel {
	const { t } = useTranslation("settings");
	const labels = useHarnessSettingsLabels();
	const scope = useMemo(() => ({ kind: "global" as const }), []);
	const ledger = useHarnessLedgerModel({
		scope,
		labels,
		canPromote: false,
	});
	return useMemo(
		() => ({
			description: t("harnessGlobalDescription"),
			ledger,
			title: t("tabHarness"),
		}),
		[ledger, t],
	);
}
