import type { DesktopHarnessEntry, DesktopRefinementEvent } from "@preload/api";
import { SettingsPageShellView, SettingSection, type SettingSectionMeta } from "@origin-org/theme-ui/settings";
import { HARNESS_KINDS, type HarnessLedgerModel } from "./useHarnessLedgerModel";

export interface HarnessLedgerViewProps {
	readonly description?: string;
	readonly entriesSection: SettingSectionMeta;
	readonly historySection: SettingSectionMeta;
	readonly model: HarnessLedgerModel;
	readonly title: string;
}

export function HarnessLedgerView({
	description,
	entriesSection,
	historySection,
	model,
	title,
}: HarnessLedgerViewProps): JSX.Element {
	return (
		<SettingsPageShellView
			title={title}
			description={model.loading ? undefined : description}
			loading={model.loading}
			loadingLabel={model.labels.loading}
			headerAction={
				model.loading ? undefined : (
					<button
						type="button"
						onClick={model.actions.openCreate}
						className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						<span className="icon-[mdi--plus] h-4 w-4" />
						{model.labels.add}
					</button>
				)
			}
		>
			{!model.loading && (
				<>
					{model.error && (
						<p className="mb-4 text-[12px] text-destructive" role="alert">
							{model.labels.errorPrefix}
							{model.error}
						</p>
					)}
					{model.read && (
						<p className="mb-4 text-[12px] text-muted-foreground">
							{model.labels.revision(model.read.revision)} ·{" "}
							{model.labels.budget(
								model.read.budget.entries,
								model.read.budget.entryLimit,
								model.read.budget.bytes,
								model.read.budget.byteLimit,
							)}
						</p>
					)}
					<SettingSection section={entriesSection} title={model.labels.sectionEntries}>
						{model.entries.length === 0 ? (
							<div className="px-5 py-8 text-center text-[13px] text-muted-foreground">{model.labels.empty}</div>
						) : (
							<ul className="divide-y divide-border">
								{model.entries.map((entry) => (
									<HarnessEntryRow key={entry.id} entry={entry} model={model} />
								))}
							</ul>
						)}
					</SettingSection>
					<SettingSection section={historySection} title={model.labels.sectionHistory}>
						{model.history.length === 0 ? (
							<div className="px-5 py-8 text-center text-[13px] text-muted-foreground">
								{model.labels.historyEmpty}
							</div>
						) : (
							<ul className="divide-y divide-border">
								{model.history.map((event) => (
									<HarnessHistoryRow key={event.digest} event={event} model={model} />
								))}
							</ul>
						)}
					</SettingSection>
					{model.editorOpen && model.editor && <HarnessEditorDialog model={model} />}
				</>
			)}
		</SettingsPageShellView>
	);
}

function HarnessEntryRow({
	entry,
	model,
}: {
	entry: DesktopHarnessEntry;
	model: HarnessLedgerModel;
}): JSX.Element {
	return (
		<li className="flex flex-col gap-2 px-5 py-4">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="truncate text-[13px] font-medium text-foreground">{entry.title}</div>
					<div className="mt-0.5 text-[11px] text-muted-foreground">
						{model.labels.kindOptions[entry.kind]} · {entry.id} · {model.labels.version(entry.version)} ·{" "}
						{model.labels.source(entry.source)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<button
						type="button"
						className="rounded-md border border-input bg-secondary px-2 py-1 text-[12px] text-foreground hover:bg-accent"
						onClick={() => model.actions.openEdit(entry)}
					>
						{model.labels.edit}
					</button>
					{model.canPromote && (
						<button
							type="button"
							className="rounded-md border border-input bg-secondary px-2 py-1 text-[12px] text-foreground hover:bg-accent"
							onClick={() => model.actions.promoteEntry(entry)}
						>
							{model.labels.promote}
						</button>
					)}
					<button
						type="button"
						className="rounded-md border border-input bg-secondary px-2 py-1 text-[12px] text-destructive hover:bg-accent"
						onClick={() => model.actions.deleteEntry(entry)}
					>
						{model.labels.delete}
					</button>
				</div>
			</div>
			<pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] text-muted-foreground">
				{entry.content}
			</pre>
		</li>
	);
}

function HarnessHistoryRow({
	event,
	model,
}: {
	event: DesktopRefinementEvent;
	model: HarnessLedgerModel;
}): JSX.Element {
	return (
		<li className="flex items-start justify-between gap-3 px-5 py-4">
			<div className="min-w-0">
				<div className="truncate text-[13px] font-medium text-foreground">{event.proposal.summary}</div>
				<div className="mt-0.5 text-[11px] text-muted-foreground">
					{model.labels.revision(event.revision)} · {event.kind} · applied {event.applied.length} · rejected{" "}
					{event.rejected.length}
				</div>
			</div>
			{event.kind === "applied" && (
				<button
					type="button"
					className="shrink-0 rounded-md border border-input bg-secondary px-2 py-1 text-[12px] text-foreground hover:bg-accent"
					onClick={() => model.actions.rollbackEvent(event)}
				>
					{model.labels.rollback}
				</button>
			)}
		</li>
	);
}

function HarnessEditorDialog({ model }: { model: HarnessLedgerModel }): JSX.Element {
	const editor = model.editor;
	if (!editor) return <></>;
	const creating = model.editingId === null;
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="harness-editor-title"
				className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-lg"
			>
				<h2 id="harness-editor-title" className="mb-4 text-[16px] font-semibold text-foreground">
					{creating ? model.labels.createTitle : model.labels.edit}
				</h2>
				<label className="mb-3 block text-[12px] text-muted-foreground">
					{model.labels.kind}
					<select
						className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground"
						value={editor.kind}
						disabled={!creating}
						onChange={(event) =>
							model.actions.updateEditor("kind", event.target.value as (typeof HARNESS_KINDS)[number])
						}
					>
						{HARNESS_KINDS.map((kind) => (
							<option key={kind} value={kind}>
								{model.labels.kindOptions[kind]}
							</option>
						))}
					</select>
				</label>
				<label className="mb-3 block text-[12px] text-muted-foreground">
					{model.labels.id}
					<input
						className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground"
						value={editor.id}
						placeholder={model.labels.idPlaceholder}
						disabled={!creating}
						onChange={(event) => model.actions.updateEditor("id", event.target.value)}
					/>
				</label>
				<label className="mb-3 block text-[12px] text-muted-foreground">
					{model.labels.title}
					<input
						className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground"
						value={editor.title}
						placeholder={model.labels.titlePlaceholder}
						onChange={(event) => model.actions.updateEditor("title", event.target.value)}
					/>
				</label>
				<label className="mb-4 block text-[12px] text-muted-foreground">
					{model.labels.content}
					<textarea
						className="mt-1 min-h-32 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-[13px] text-foreground"
						value={editor.content}
						placeholder={model.labels.contentPlaceholder}
						onChange={(event) => model.actions.updateEditor("content", event.target.value)}
					/>
				</label>
				{model.editorError && (
					<p className="mb-3 text-[12px] text-destructive" role="alert">
						{model.editorError}
					</p>
				)}
				<div className="flex justify-end gap-2">
					<button
						type="button"
						className="rounded-md border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground hover:bg-accent"
						onClick={model.actions.closeEditor}
					>
						{model.labels.cancel}
					</button>
					<button
						type="button"
						className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
						disabled={model.saving}
						onClick={() => void model.actions.save()}
					>
						{model.saving ? model.labels.saving : model.labels.save}
					</button>
				</div>
			</div>
		</div>
	);
}
