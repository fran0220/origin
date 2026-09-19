import type { JSX, ReactNode } from "react";
import { SettingRow, SettingSection, type SettingSectionMeta } from "./SettingChrome";

export type EnvironmentRuntimeKindView = "node" | "python" | "ffmpeg";

export interface EnvironmentRuntimeStatusView {
	readonly managedVersion?: string;
	readonly ready: boolean;
	readonly supported: boolean;
}

export interface EnvironmentSettingsViewLabels {
	readonly description: string;
	readonly fetch: string;
	readonly fetchAgain: string;
	readonly fetching: string;
	readonly loading: string;
	readonly notReady: string;
	readonly npmRegistry: string;
	readonly npmRegistryDescription: string;
	readonly pipIndex: string;
	readonly pipIndexDescription: string;
	readonly platformNotSupported: string;
	readonly ready: string;
	readonly runtimeDescriptions: Record<EnvironmentRuntimeKindView, string>;
	readonly sections: {
		readonly mirrors: string;
		readonly runtime: string;
		readonly recording?: string;
	};
	readonly recordingRetention?: {
		readonly title: string;
		readonly description: string;
		readonly options: readonly { readonly value: "30m" | "2h" | "until-cleared"; readonly label: string }[];
	};
	readonly title: string;
}

export interface EnvironmentSettingsViewProps {
	readonly busy: EnvironmentRuntimeKindView | null;
	readonly error: string | null;
	readonly headerAction?: ReactNode;
	readonly labels: EnvironmentSettingsViewLabels;
	readonly mirrors?: {
		readonly npmRegistry: string;
		readonly pipIndexUrl: string;
	} | null;
	readonly onReinstall: (kind: EnvironmentRuntimeKindView) => void;
	readonly onRecordingRetentionChange?: (value: "30m" | "2h" | "until-cleared") => void;
	readonly recordingRetention?: "30m" | "2h" | "until-cleared";
	readonly runtimeSection: SettingSectionMeta;
	readonly mirrorsSection: SettingSectionMeta;
	readonly recordingSection?: SettingSectionMeta;
	readonly status: {
		readonly node: EnvironmentRuntimeStatusView;
		readonly python: EnvironmentRuntimeStatusView;
		readonly ffmpeg?: EnvironmentRuntimeStatusView;
	} | null;
}

const RUNTIME_META: Record<EnvironmentRuntimeKindView, { icon: string; name: string }> = {
	node: { icon: "icon-[mdi--nodejs]", name: "Node.js" },
	python: { icon: "icon-[mdi--language-python]", name: "Python" },
	ffmpeg: { icon: "icon-[mdi--movie-open-outline]", name: "ffmpeg" },
};

function RuntimeCard({
	busy,
	kind,
	labels,
	onReinstall,
	status,
}: {
	busy: boolean;
	kind: EnvironmentRuntimeKindView;
	labels: EnvironmentSettingsViewLabels;
	onReinstall: () => void;
	status: EnvironmentRuntimeStatusView;
}): JSX.Element {
	const meta = RUNTIME_META[kind];
	const stateText = !status.supported
		? labels.platformNotSupported
		: status.ready
			? `${labels.ready} · ${status.managedVersion}`
			: busy
				? labels.fetching
				: labels.notReady;
	const stateClass = status.ready
		? "text-emerald-500"
		: status.supported
			? "text-amber-500"
			: "text-muted-foreground";

	return (
		<SettingRow title={meta.name} description={labels.runtimeDescriptions[kind]} border={kind !== "ffmpeg"}>
			<div className="flex items-center gap-3">
				<div className="flex items-center gap-1.5">
					<span
						className={
							status.ready
								? "icon-[mdi--check-circle] h-4 w-4 text-emerald-500"
								: "icon-[mdi--alert-circle-outline] h-4 w-4 text-amber-500"
						}
					/>
					<span className={`text-[12px] ${stateClass}`}>{stateText}</span>
				</div>
				{status.supported && (
					<button
						type="button"
						disabled={busy}
						onClick={onReinstall}
						className="flex items-center gap-1.5 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						{busy ? (
							<span className="icon-[mdi--loading] h-3.5 w-3.5 animate-spin" />
						) : (
							<span className="icon-[mdi--download-outline] h-3.5 w-3.5 text-muted-foreground" />
						)}
						{status.ready ? labels.fetchAgain : labels.fetch}
					</button>
				)}
			</div>
		</SettingRow>
	);
}

export function EnvironmentSettingsView({
	busy,
	error,
	headerAction,
	labels,
	mirrors,
	mirrorsSection,
	onReinstall,
	onRecordingRetentionChange,
	recordingRetention,
	recordingSection,
	runtimeSection,
	status,
}: EnvironmentSettingsViewProps): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 pt-2 pb-4">
			<div className="mb-6">
				<div className="mb-1.5 flex flex-wrap items-center justify-between gap-3">
					<h1 className="text-[20px] font-bold text-foreground">{labels.title}</h1>
					{headerAction}
				</div>
				<p className="text-[13px] text-muted-foreground">{labels.description}</p>
			</div>

			{error && (
				<div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-[12px] text-destructive">
					{error}
				</div>
			)}

			<SettingSection title={labels.sections.runtime} section={runtimeSection}>
				{status ? (
					<>
						<RuntimeCard
							kind="node"
							status={status.node}
							busy={busy === "node"}
							labels={labels}
							onReinstall={() => onReinstall("node")}
						/>
						<RuntimeCard
							kind="python"
							status={status.python}
							busy={busy === "python"}
							labels={labels}
							onReinstall={() => onReinstall("python")}
						/>
						{status.ffmpeg ? (
							<RuntimeCard
								kind="ffmpeg"
								status={status.ffmpeg}
								busy={busy === "ffmpeg"}
								labels={labels}
								onReinstall={() => onReinstall("ffmpeg")}
							/>
						) : null}
					</>
				) : (
					<div className="px-5 py-4 text-[12px] text-muted-foreground">{labels.loading}</div>
				)}
			</SettingSection>

			{labels.recordingRetention && recordingSection ? (
				<SettingSection title={labels.sections.recording ?? labels.recordingRetention.title} section={recordingSection}>
					<SettingRow
						title={labels.recordingRetention.title}
						description={labels.recordingRetention.description}
						border={false}
					>
						<select
							className="rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground"
							value={recordingRetention ?? "2h"}
							onChange={(event) => {
								const value = event.target.value;
								if (value === "30m" || value === "2h" || value === "until-cleared") {
									onRecordingRetentionChange?.(value);
								}
							}}
						>
							{labels.recordingRetention.options.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</SettingRow>
				</SettingSection>
			) : null}

			<SettingSection title={labels.sections.mirrors} section={mirrorsSection}>
				<SettingRow title={labels.npmRegistry} description={labels.npmRegistryDescription} border>
					<span className="text-[12px] text-muted-foreground">{mirrors?.npmRegistry ?? "—"}</span>
				</SettingRow>
				<SettingRow title={labels.pipIndex} description={labels.pipIndexDescription} border={false}>
					<span className="text-[12px] text-muted-foreground">{mirrors?.pipIndexUrl ?? "—"}</span>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
