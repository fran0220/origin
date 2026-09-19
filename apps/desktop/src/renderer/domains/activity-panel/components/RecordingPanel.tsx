import type { RecordingRecord } from "@vetta/runtime-recording";
import { toVettaFileUrl } from "@shared/lib/utils";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivityPanelCwd } from "../registry/context";

export function RecordingPanel(): JSX.Element {
	const { t } = useTranslation("recording");
	const cwd = useActivityPanelCwd();
	const [records, setRecords] = useState<readonly RecordingRecord[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [samplePaths, setSamplePaths] = useState<readonly string[]>([]);

	const refresh = useCallback(async () => {
		try {
			setRecords(await window.vetta.recording.list());
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const selected = records.find((record) => record.id === selectedId) ?? records[0];

	async function run(action: () => Promise<unknown>): Promise<void> {
		setBusy(true);
		setError(null);
		try {
			await action();
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col gap-3 p-3" data-testid="recording-panel">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-[13px] font-semibold text-foreground">{t("title")}</h2>
				<button
					type="button"
					className="rounded-md border border-input px-2 py-1 text-[12px]"
					disabled={busy}
					onClick={() => void refresh()}
				>
					{t("refresh")}
				</button>
			</div>
			{error ? <p className="text-[12px] text-destructive">{error}</p> : null}
			<div className="min-h-0 flex-1 overflow-auto">
				{records.length === 0 ? (
					<p className="text-[12px] text-muted-foreground">{t("empty")}</p>
				) : (
					<ul className="flex flex-col gap-1">
						{records.map((record) => (
							<li key={record.id}>
								<button
									type="button"
									className={`w-full rounded-md px-2 py-1 text-left text-[12px] ${selected?.id === record.id ? "bg-accent" : "hover:bg-muted"}`}
									onClick={() => setSelectedId(record.id)}
								>
									{record.id} · {record.status} · {record.durationMs ?? 0}ms
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
			{selected?.video ? (
				<video
					className="max-h-48 w-full rounded-md bg-black"
					controls
					src={toVettaFileUrl(selected.video.path)}
				>
					<track kind="captions" />
				</video>
			) : null}
			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					className="rounded-md border border-input px-2 py-1 text-[12px]"
					disabled={busy || !cwd}
					onClick={() =>
						void run(() =>
							window.vetta.recording.start({
								projectKey: "home",
								sessionId: "desktop",
								url: "https://example.com",
								cwd: cwd ?? undefined,
							}),
						)
					}
				>
					{t("start")}
				</button>
				<button
					type="button"
					className="rounded-md border border-input px-2 py-1 text-[12px]"
					disabled={busy || !selected}
					onClick={() => selected && void run(() => window.vetta.recording.stop(selected.id))}
				>
					{t("stop")}
				</button>
				<button
					type="button"
					className="rounded-md border border-input px-2 py-1 text-[12px]"
					disabled={busy || !selected || selected.status !== "ready"}
					onClick={() =>
						selected &&
						void run(async () => {
							const sample = await window.vetta.recording.sample({
								recordingId: selected.id,
								everyMs: 1_000,
								contactSheet: { columns: 3 },
							});
							setSamplePaths(sample.frames.map((frame) => frame.path));
						})
					}
				>
					{t("sample")}
				</button>
				<button
					type="button"
					className="rounded-md border border-input px-2 py-1 text-[12px]"
					disabled={busy || !selected}
					onClick={() => selected && void run(() => window.vetta.recording.clear(selected.id))}
				>
					{t("clear")}
				</button>
			</div>
			{samplePaths.length > 0 ? (
				<div className="flex flex-wrap gap-1">
					{samplePaths.map((path) => (
						<img key={path} alt={t("framePreview")} className="h-16 w-auto rounded" src={toVettaFileUrl(path)} />
					))}
				</div>
			) : null}
		</div>
	);
}
