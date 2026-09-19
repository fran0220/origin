import { SETTINGS_SECTION } from "../registry";
import { HarnessLedgerView } from "./HarnessLedgerView";
import type { HarnessSettingsModel } from "./useHarnessSettingsModel";

export function HarnessSettingsView({ model }: { model: HarnessSettingsModel }): JSX.Element {
	return (
		<HarnessLedgerView
			title={model.title}
			description={model.description}
			entriesSection={SETTINGS_SECTION["harness-entries"]}
			historySection={SETTINGS_SECTION["harness-history"]}
			model={model.ledger}
		/>
	);
}
