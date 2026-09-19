import type { PluginRecordingRecord } from "@vetta-org/plugin-sdk";
import { useTranslation } from "@vetta-org/plugin-sdk";
import { useEffect, useState } from "react";
import { listHostRecordings, resolveProjectIdentity } from "../adapters/host-capabilities";
import { getPluginCtx } from "../plugin-context";
import { subscribeProjectChanges } from "../store/project-store";

export function RecordingsTab() {
	const { t } = useTranslation();
	const [recordings, setRecordings] = useState<readonly PluginRecordingRecord[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const ctx = getPluginCtx();
		if (!ctx.recording) {
			setRecordings([]);
			return;
		}
		let cwd: string | null = null;
		let generation = 0;
		const refresh = () => {
			const request = ++generation;
			setError(null);
			if (!cwd) {
				setRecordings([]);
				return;
			}
			setRecordings(null);
			void resolveProjectIdentity(ctx, cwd)
				.then((identity) => listHostRecordings(ctx, identity.recordingProjectKey))
				.then((items) => {
					if (request !== generation) return;
					setRecordings(items);
				})
				.catch((cause: unknown) => {
					if (request !== generation) return;
					setError(cause instanceof Error ? cause.message : String(cause));
					setRecordings([]);
				});
		};
		const unsubscribe = ctx.conversation.on((event) => {
			if (event.type !== "conversation-changed") return;
			cwd = event.conversation.cwd || null;
			refresh();
		});
		const unsubscribeProject = subscribeProjectChanges((changedCwd) => {
			if (changedCwd === cwd) refresh();
		});
		return () => {
			generation++;
			unsubscribe.dispose();
			unsubscribeProject();
		};
	}, []);

	return (
		<div className="flex h-full flex-col gap-3 p-3">
			<h2 className="text-sm font-medium">{t("tab.recordings")}</h2>
			{error ? (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			) : recordings === null ? (
				<p className="text-sm text-muted-foreground">{t("recordings.loading")}</p>
			) : recordings.length === 0 ? (
				<div role="status" className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
					{t("recordings.empty")}
				</div>
			) : (
				<ul className="flex flex-col gap-2">
					{recordings.map((record) => (
						<li key={record.id} className="rounded border border-border p-2 text-sm">
							<p className="font-medium">{record.id}</p>
							<p className="text-muted-foreground">{t("recordings.status", { status: record.status })}</p>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
