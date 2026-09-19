import { ConnectionsSettingsView } from "./ConnectionsSettingsView";
import { useConnectionsSettingsModel } from "./useConnectionsSettingsModel";

export function ConnectionsSettings(): JSX.Element {
	return <ConnectionsSettingsView model={useConnectionsSettingsModel()} />;
}
