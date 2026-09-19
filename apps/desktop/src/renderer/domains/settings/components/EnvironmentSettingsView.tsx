import { EnvironmentSettingsView as ThemeEnvironmentSettingsView } from "@origin-org/theme-ui/settings";
import { SettingsAiAssist } from "../ai-assist";
import { SETTINGS_SECTION } from "../registry";
import type { EnvironmentSettingsModel } from "./useEnvironmentSettingsModel";

export interface EnvironmentSettingsViewProps {
	model: EnvironmentSettingsModel;
}

export function EnvironmentSettingsView({ model }: EnvironmentSettingsViewProps): JSX.Element {
	return (
		<ThemeEnvironmentSettingsView
			busy={model.busy}
			error={model.error}
			headerAction={<SettingsAiAssist tabId="environment" />}
			labels={model.labels}
			mirrors={model.status?.mirrors ?? null}
			mirrorsSection={SETTINGS_SECTION["environment-mirrors"]}
			runtimeSection={SETTINGS_SECTION["environment-runtime"]}
			recordingSection={SETTINGS_SECTION["environment-recording"]}
			recordingRetention={model.recordingRetention}
			status={model.status}
			onReinstall={(kind) => void model.actions.reinstall(kind)}
			onRecordingRetentionChange={(value) => void model.actions.setRecordingRetention(value)}
		/>
	);
}
