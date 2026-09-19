import { SETTINGS_SECTION } from "@domains/settings/registry";
import { HarnessLedgerView } from "@domains/settings/components/HarnessLedgerView";
import {
	useHarnessLedgerModel,
	useHarnessSettingsLabels,
} from "@domains/settings/components/useHarnessLedgerModel";
import { useTranslation } from "react-i18next";

export function ProjectHarnessSection({ subjectId }: { subjectId: string }): JSX.Element {
	const { t } = useTranslation("project");
	const labels = useHarnessSettingsLabels();
	const ledger = useHarnessLedgerModel({
		scope: { kind: "subject", subjectId },
		labels,
		canPromote: true,
	});
	return (
		<div className="px-4 pb-6 @md:px-8">
			<HarnessLedgerView
				title={t("detail.harnessTitle")}
				description={t("detail.harnessDescription")}
				entriesSection={SETTINGS_SECTION["harness-entries"]}
				historySection={SETTINGS_SECTION["harness-history"]}
				model={ledger}
			/>
		</div>
	);
}
