import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SETTINGS_SECTION } from "../registry";
import { recordSettingsUsage } from "./recordSettingsUsage";

type RuntimesStatus = Awaited<ReturnType<typeof window.originApp.runtimes.getStatus>>;
export type EnvironmentRuntimeStatus = RuntimesStatus["node"];
export type EnvironmentRuntimeKind = "node" | "python" | "ffmpeg";
export type EnvironmentRecordingRetention = "30m" | "2h" | "until-cleared";

export interface EnvironmentSettingsModel {
	actions: {
		reinstall: (kind: EnvironmentRuntimeKind) => Promise<void>;
		setRecordingRetention: (value: EnvironmentRecordingRetention) => Promise<void>;
	};
	busy: EnvironmentRuntimeKind | null;
	error: string | null;
	recordingRetention: EnvironmentRecordingRetention;
	labels: {
		description: string;
		fetch: string;
		fetchAgain: string;
		fetching: string;
		loading: string;
		notReady: string;
		npmRegistry: string;
		npmRegistryDescription: string;
		pipIndex: string;
		pipIndexDescription: string;
		platformNotSupported: string;
		ready: string;
		runtimeDescriptions: Record<EnvironmentRuntimeKind, string>;
		sections: {
			mirrors: string;
			runtime: string;
			recording?: string;
		};
		recordingRetention?: {
			title: string;
			description: string;
			options: readonly { value: EnvironmentRecordingRetention; label: string }[];
		};
		title: string;
	};
	status: RuntimesStatus | null;
}

export function useEnvironmentSettingsModel(): EnvironmentSettingsModel {
	const { t } = useTranslation("settings");
	const [status, setStatus] = useState<RuntimesStatus | null>(null);
	const [busy, setBusy] = useState<EnvironmentRuntimeKind | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [recordingRetention, setRecordingRetention] = useState<EnvironmentRecordingRetention>("2h");

	const refresh = useCallback(async () => {
		try {
			setStatus(await window.originApp.runtimes.getStatus());
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
		void window.originApp.config.get().then((config) => {
			const retention = config.recording?.defaultRetention;
			if (retention === "30m" || retention === "2h" || retention === "until-cleared") {
				setRecordingRetention(retention);
			}
		});
	}, [refresh]);

	const reinstall = useCallback(
		async (kind: EnvironmentRuntimeKind) => {
			setBusy(kind);
			setError(null);
			try {
				await window.originApp.runtimes.reinstall(kind);
				await refresh();
				recordSettingsUsage({ tab: "environment", action: "reinstalled", target: "runtime", value: kind });
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy(null);
			}
		},
		[refresh],
	);

	const setRetention = useCallback(async (value: EnvironmentRecordingRetention) => {
		setRecordingRetention(value);
		await window.originApp.config.set({ recording: { defaultRetention: value } });
		recordSettingsUsage({ tab: "environment", action: "changed", target: "recordingRetention", value });
	}, []);

	const labels = useMemo<EnvironmentSettingsModel["labels"]>(
		() => ({
			description: t("environmentDescription"),
			fetch: t("fetch"),
			fetchAgain: t("fetchAgain"),
			fetching: t("fetching"),
			loading: t("loading"),
			notReady: t("notReady"),
			npmRegistry: t("npmRegistry"),
			npmRegistryDescription: t("npmRegistryDesc"),
			pipIndex: t("pipIndex"),
			pipIndexDescription: t("pipIndexDesc"),
			platformNotSupported: t("platformNotSupported"),
			ready: t("ready"),
			runtimeDescriptions: {
				node: t("environmentNodeDesc"),
				python: t("environmentPythonDesc"),
				ffmpeg: t("environmentFfmpegDesc"),
			},
			sections: {
				mirrors: t(SETTINGS_SECTION["environment-mirrors"].titleKey),
				runtime: t(SETTINGS_SECTION["environment-runtime"].titleKey),
				recording: t(SETTINGS_SECTION["environment-recording"].titleKey),
			},
			recordingRetention: {
				title: t("recordingRetentionTitle"),
				description: t("recordingRetentionDesc"),
				options: [
					{ value: "30m", label: t("recordingRetention30m") },
					{ value: "2h", label: t("recordingRetention2h") },
					{ value: "until-cleared", label: t("recordingRetentionUntilCleared") },
				],
			},
			title: t("environment"),
		}),
		[t],
	);

	return {
		actions: { reinstall, setRecordingRetention: setRetention },
		busy,
		error,
		recordingRetention,
		labels,
		status,
	};
}
