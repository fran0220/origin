import { HarnessSettingsView } from "./HarnessSettingsView";
import { useHarnessSettingsModel } from "./useHarnessSettingsModel";

export function HarnessSettings(): JSX.Element {
	return <HarnessSettingsView model={useHarnessSettingsModel()} />;
}
