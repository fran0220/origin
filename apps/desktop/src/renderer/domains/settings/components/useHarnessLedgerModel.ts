import type {
	DesktopEvolutionReadResult,
	DesktopEvolutionScope,
	DesktopHarnessEdit,
	DesktopHarnessEntry,
	DesktopHarnessEntryKind,
	DesktopRefinementEvent,
} from "@preload/api";
import { confirmDialogAtom } from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export const HARNESS_KINDS: readonly DesktopHarnessEntryKind[] = ["prompt", "memory", "skill", "subagent"];

export interface HarnessEditorState {
	readonly content: string;
	readonly id: string;
	readonly kind: DesktopHarnessEntryKind;
	readonly title: string;
}

export interface HarnessLedgerLabels {
	readonly add: string;
	readonly budget: (entries: number, entryLimit: number, bytes: number, byteLimit: number) => string;
	readonly cancel: string;
	readonly content: string;
	readonly contentPlaceholder: string;
	readonly createTitle: string;
	readonly delete: string;
	readonly deleteConfirm: (title: string) => string;
	readonly edit: string;
	readonly empty: string;
	readonly errorPrefix: string;
	readonly historyEmpty: string;
	readonly id: string;
	readonly idPlaceholder: string;
	readonly kind: string;
	readonly kindOptions: Record<DesktopHarnessEntryKind, string>;
	readonly loading: string;
	readonly promote: string;
	readonly promoteConfirm: (title: string) => string;
	readonly revision: (revision: number) => string;
	readonly rollback: string;
	readonly rollbackConfirm: (summary: string) => string;
	readonly save: string;
	readonly saving: string;
	readonly sectionEntries: string;
	readonly sectionHistory: string;
	readonly source: (source: string) => string;
	readonly title: string;
	readonly titlePlaceholder: string;
	readonly version: (version: number) => string;
}

export interface HarnessLedgerModel {
	readonly actions: {
		readonly closeEditor: () => void;
		readonly deleteEntry: (entry: DesktopHarnessEntry) => void;
		readonly openCreate: () => void;
		readonly openEdit: (entry: DesktopHarnessEntry) => void;
		readonly promoteEntry: (entry: DesktopHarnessEntry) => void;
		readonly rollbackEvent: (event: DesktopRefinementEvent) => void;
		readonly save: () => Promise<void>;
		readonly updateEditor: <K extends keyof HarnessEditorState>(key: K, value: HarnessEditorState[K]) => void;
	};
	readonly canPromote: boolean;
	readonly editor: HarnessEditorState | null;
	readonly editorError: string | null;
	readonly editorOpen: boolean;
	readonly editingId: string | null;
	readonly entries: readonly DesktopHarnessEntry[];
	readonly error: string | null;
	readonly history: readonly DesktopRefinementEvent[];
	readonly labels: HarnessLedgerLabels;
	readonly loading: boolean;
	readonly read: DesktopEvolutionReadResult | null;
	readonly saving: boolean;
}

function emptyEditor(): HarnessEditorState {
	return { id: "", kind: "prompt", title: "", content: "" };
}

function editorFromEntry(entry: DesktopHarnessEntry): HarnessEditorState {
	return { id: entry.id, kind: entry.kind, title: entry.title, content: entry.content };
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function useHarnessLedgerModel(input: {
	readonly canPromote?: boolean;
	readonly labels: HarnessLedgerLabels;
	readonly scope: DesktopEvolutionScope;
}): HarnessLedgerModel {
	const { t } = useTranslation("settings");
	const setConfirm = useSetAtom(confirmDialogAtom);
	const [read, setRead] = useState<DesktopEvolutionReadResult | null>(null);
	const [history, setHistory] = useState<readonly DesktopRefinementEvent[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [editorOpen, setEditorOpen] = useState(false);
	const [editing, setEditing] = useState<DesktopHarnessEntry | null>(null);
	const [editor, setEditor] = useState<HarnessEditorState | null>(null);
	const [editorError, setEditorError] = useState<string | null>(null);

	const scope = input.scope;
	const scopeKey = scope.kind === "global" ? "global" : `subject:${scope.subjectId}`;

	const load = useCallback(async () => {
		const currentScope: DesktopEvolutionScope =
			scopeKey === "global" ? { kind: "global" } : { kind: "subject", subjectId: scopeKey.slice("subject:".length) };
		setLoading(true);
		setError(null);
		try {
			const [nextRead, nextHistory] = await Promise.all([
				window.originApp.evolution.read(currentScope),
				window.originApp.evolution.history({ scope: currentScope, limit: 64 }),
			]);
			setRead(nextRead);
			setHistory(nextHistory);
		} catch (caught) {
			setError(formatError(caught));
		} finally {
			setLoading(false);
		}
	}, [scopeKey]);

	useEffect(() => {
		void load();
	}, [load]);

	const closeEditor = useCallback(() => {
		setEditorOpen(false);
		setEditing(null);
		setEditor(null);
		setEditorError(null);
	}, []);

	const save = useCallback(async () => {
		if (!editor) return;
		const title = editor.title.trim();
		const content = editor.content.trim();
		if (!title || !content) {
			setEditorError(t("harnessTitleContentRequired"));
			return;
		}
		setSaving(true);
		setEditorError(null);
		try {
			const edit: DesktopHarnessEdit = editing
				? {
						action: "update",
						id: editing.id,
						expectedVersion: editing.version,
						patch: { title, content },
					}
				: {
						action: "create",
						entry: {
							...(editor.id.trim() ? { id: editor.id.trim() } : {}),
							kind: editor.kind,
							title,
							content,
						},
					};
			await window.originApp.evolution.commit({
				scope,
				source: "host",
				proposal: {
					summary: editing ? `update '${title}'` : `create '${title}'`,
					rationale: "written from the harness settings surface",
					expectedOutcome: "later Turns start from this entry",
					edits: [edit],
				},
			});
			closeEditor();
			await load();
		} catch (caught) {
			setEditorError(formatError(caught));
		} finally {
			setSaving(false);
		}
	}, [closeEditor, editing, editor, load, scope, t]);

	const deleteEntry = useCallback(
		(entry: DesktopHarnessEntry) => {
			setConfirm({
				title: input.labels.delete,
				message: input.labels.deleteConfirm(entry.title),
				variant: "danger",
				onConfirm: () => {
					void (async () => {
						try {
							await window.originApp.evolution.commit({
								scope,
								source: "host",
								proposal: {
									summary: `delete '${entry.title}'`,
									rationale: "removed from the harness settings surface",
									expectedOutcome: "later Turns no longer start from this entry",
									edits: [{ action: "delete", id: entry.id, expectedVersion: entry.version }],
								},
							});
							await load();
						} catch (caught) {
							setError(formatError(caught));
						}
					})();
				},
			});
		},
		[input.labels, load, scope, setConfirm],
	);

	const promoteEntry = useCallback(
		(entry: DesktopHarnessEntry) => {
			if (scope.kind !== "subject") return;
			const subjectId = scope.subjectId;
			setConfirm({
				title: input.labels.promote,
				message: input.labels.promoteConfirm(entry.title),
				onConfirm: () => {
					void (async () => {
						try {
							await window.originApp.evolution.promote({ subjectId, entryId: entry.id });
							await load();
						} catch (caught) {
							setError(formatError(caught));
						}
					})();
				},
			});
		},
		[input.labels, load, scope, setConfirm],
	);

	const rollbackEvent = useCallback(
		(event: DesktopRefinementEvent) => {
			setConfirm({
				title: input.labels.rollback,
				message: input.labels.rollbackConfirm(event.proposal.summary),
				variant: "danger",
				onConfirm: () => {
					void (async () => {
						try {
							await window.originApp.evolution.rollback({
								scope,
								digest: event.digest,
								reason: "taken back from the harness settings surface",
							});
							await load();
						} catch (caught) {
							setError(formatError(caught));
						}
					})();
				},
			});
		},
		[input.labels, load, scope, setConfirm],
	);

	return useMemo(
		() => ({
			actions: {
				closeEditor,
				deleteEntry,
				openCreate: () => {
					setEditing(null);
					setEditor(emptyEditor());
					setEditorError(null);
					setEditorOpen(true);
				},
				openEdit: (entry) => {
					setEditing(entry);
					setEditor(editorFromEntry(entry));
					setEditorError(null);
					setEditorOpen(true);
				},
				promoteEntry,
				rollbackEvent,
				save,
				updateEditor: (key, value) => {
					setEditor((current) => (current ? { ...current, [key]: value } : current));
				},
			},
			canPromote: Boolean(input.canPromote) && scope.kind === "subject",
			editor,
			editorError,
			editorOpen,
			editingId: editing?.id ?? null,
			entries: read?.entries ?? [],
			error,
			history,
			labels: input.labels,
			loading,
			read,
			saving,
		}),
		[
			closeEditor,
			deleteEntry,
			editing,
			editor,
			editorError,
			editorOpen,
			error,
			history,
			input.canPromote,
			input.labels,
			scope.kind,
			loading,
			promoteEntry,
			read,
			rollbackEvent,
			save,
			saving,
		],
	);
}

export function useHarnessSettingsLabels(): HarnessLedgerLabels {
	const { t } = useTranslation("settings");
	return useMemo(
		() => ({
			add: t("harnessAdd"),
			budget: (entries, entryLimit, bytes, byteLimit) =>
				t("harnessBudget", { entries, entryLimit, bytes, byteLimit }),
			cancel: t("harnessCancel"),
			content: t("harnessContent"),
			contentPlaceholder: t("harnessContentPlaceholder"),
			createTitle: t("harnessCreateTitle"),
			delete: t("harnessDelete"),
			deleteConfirm: (title) => t("harnessDeleteConfirm", { title }),
			edit: t("harnessEdit"),
			empty: t("harnessEmpty"),
			errorPrefix: t("harnessErrorPrefix"),
			historyEmpty: t("harnessHistoryEmpty"),
			id: t("harnessId"),
			idPlaceholder: t("harnessIdPlaceholder"),
			kind: t("harnessKind"),
			kindOptions: {
				prompt: t("harnessKindPrompt"),
				memory: t("harnessKindMemory"),
				skill: t("harnessKindSkill"),
				subagent: t("harnessKindSubagent"),
			},
			loading: t("harnessLoading"),
			promote: t("harnessPromote"),
			promoteConfirm: (title) => t("harnessPromoteConfirm", { title }),
			revision: (revision) => t("harnessRevision", { revision }),
			rollback: t("harnessRollback"),
			rollbackConfirm: (summary) => t("harnessRollbackConfirm", { summary }),
			save: t("harnessSave"),
			saving: t("harnessSaving"),
			sectionEntries: t("section_harness-entries"),
			sectionHistory: t("section_harness-history"),
			source: (source) => t("harnessSource", { source }),
			title: t("harnessEntryTitle"),
			titlePlaceholder: t("harnessTitlePlaceholder"),
			version: (version) => t("harnessVersion", { version }),
		}),
		[t],
	);
}
