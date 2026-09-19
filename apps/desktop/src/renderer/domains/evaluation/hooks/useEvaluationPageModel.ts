import type {
	EvaluationAttempt,
	EvaluationAttemptView,
	EvaluationDefinition,
	EvaluationScope,
	UpsertCriterionInput,
} from "@preload/api";
import { useOwnedHeaderTitleHidden } from "@shared/hooks/useOwnedHeaderTitleHidden";
import { useSurfaceActive } from "@shared/surface-active";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export interface EvaluationDraftCriterion {
	id?: string;
	title: string;
	required: boolean;
	command: string;
	args: string;
}

export interface EvaluationPageModel {
	readonly labels: {
		readonly title: string;
		readonly subtitle: string;
		readonly newDefinition: string;
		readonly run: string;
		readonly save: string;
		readonly back: string;
		readonly emptyTitle: string;
		readonly emptyDesc: string;
		readonly emptyAction: string;
	};
	readonly definitions: readonly EvaluationDefinition[];
	readonly attempts: readonly EvaluationAttempt[];
	readonly selectedDefinitionId: string | null;
	readonly selectedAttempt: EvaluationAttemptView | null;
	readonly editing: boolean;
	readonly draftTitle: string;
	readonly draftCriteria: readonly EvaluationDraftCriterion[];
	readonly running: boolean;
	readonly error: string | null;
	readonly selectDefinition: (id: string) => void;
	readonly selectAttempt: (id: string) => void;
	readonly startCreate: () => void;
	readonly setDraftTitle: (title: string) => void;
	readonly setCriterionTitle: (index: number, title: string) => void;
	readonly setCriterionRequired: (index: number, required: boolean) => void;
	readonly setCriterionCommand: (index: number, command: string) => void;
	readonly setCriterionArgs: (index: number, args: string) => void;
	readonly addCriterion: () => void;
	readonly removeCriterion: (index: number) => void;
	readonly saveDefinition: () => Promise<void>;
	readonly runSelected: () => Promise<void>;
	readonly backToList: () => void;
}

const GLOBAL_SCOPE: EvaluationScope = { kind: "global" };

function emptyCriteria(): EvaluationDraftCriterion[] {
	return [
		{ title: "", required: true, command: "", args: "" },
		{ title: "", required: false, command: "", args: "" },
	];
}

export function useEvaluationPageModel(): EvaluationPageModel {
	const { t } = useTranslation("evaluation");
	useOwnedHeaderTitleHidden(useSurfaceActive());
	const [definitions, setDefinitions] = useState<EvaluationDefinition[]>([]);
	const [attempts, setAttempts] = useState<EvaluationAttempt[]>([]);
	const [selectedDefinitionId, setSelectedDefinitionId] = useState<string | null>(null);
	const [selectedAttempt, setSelectedAttempt] = useState<EvaluationAttemptView | null>(null);
	const [editing, setEditing] = useState(false);
	const [draftTitle, setDraftTitle] = useState("");
	const [draftCriteria, setDraftCriteria] = useState<EvaluationDraftCriterion[]>(emptyCriteria);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const [nextDefinitions, nextAttempts] = await Promise.all([
				window.vetta.evaluation.listDefinitions(GLOBAL_SCOPE),
				window.vetta.evaluation.listAttempts(GLOBAL_SCOPE),
			]);
			setDefinitions([...nextDefinitions]);
			setAttempts([...nextAttempts]);
		} catch {
			setError(t("error.load"));
		}
	}, [t]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const startCreate = useCallback(() => {
		setEditing(true);
		setSelectedAttempt(null);
		setSelectedDefinitionId(null);
		setDraftTitle("");
		setDraftCriteria(emptyCriteria());
	}, []);

	const saveDefinition = useCallback(async () => {
		try {
			setError(null);
			const criteria: UpsertCriterionInput[] = draftCriteria
				.filter((criterion) => criterion.title.trim().length > 0)
				.map((criterion) => ({
					...(criterion.id ? { id: criterion.id } : {}),
					title: criterion.title.trim(),
					required: criterion.required,
					...(criterion.command.trim()
						? {
								verifier: {
									kind: "command" as const,
									command: criterion.command.trim(),
									args: criterion.args.trim() ? criterion.args.trim().split(/\s+/) : [],
								},
							}
						: {}),
				}));
			const saved = await window.vetta.evaluation.upsertDefinition(GLOBAL_SCOPE, {
				title: draftTitle,
				criteria,
			});
			setEditing(false);
			setSelectedDefinitionId(saved.id);
			await refresh();
		} catch {
			setError(t("error.save"));
		}
	}, [draftCriteria, draftTitle, refresh, t]);

	const runSelected = useCallback(async () => {
		if (!selectedDefinitionId) return;
		try {
			setRunning(true);
			setError(null);
			const attempt = await window.vetta.evaluation.run(GLOBAL_SCOPE, selectedDefinitionId, { kind: "manual" });
			const view = await window.vetta.evaluation.get(GLOBAL_SCOPE, attempt.id);
			setSelectedAttempt(view);
			await refresh();
		} catch {
			setError(t("error.run"));
		} finally {
			setRunning(false);
		}
	}, [refresh, selectedDefinitionId, t]);

	const selectAttempt = useCallback(
		async (id: string) => {
			try {
				setError(null);
				setSelectedAttempt(await window.vetta.evaluation.get(GLOBAL_SCOPE, id));
			} catch {
				setError(t("error.load"));
			}
		},
		[t],
	);

	const labels = useMemo(
		() => ({
			title: t("page.title"),
			subtitle: t("page.subtitle"),
			newDefinition: t("page.newDefinition"),
			run: t("page.run"),
			save: t("page.save"),
			back: t("page.back"),
			emptyTitle: t("empty.title"),
			emptyDesc: t("empty.desc"),
			emptyAction: t("empty.action"),
		}),
		[t],
	);

	return {
		labels,
		definitions,
		attempts,
		selectedDefinitionId,
		selectedAttempt,
		editing,
		draftTitle,
		draftCriteria,
		running,
		error,
		selectDefinition: (id) => {
			setSelectedDefinitionId(id);
			setSelectedAttempt(null);
			setEditing(false);
		},
		selectAttempt: (id) => {
			void selectAttempt(id);
		},
		startCreate,
		setDraftTitle,
		setCriterionTitle: (index, title) => {
			setDraftCriteria((current) =>
				current.map((item, itemIndex) => (itemIndex === index ? { ...item, title } : item)),
			);
		},
		setCriterionRequired: (index, required) => {
			setDraftCriteria((current) =>
				current.map((item, itemIndex) => (itemIndex === index ? { ...item, required } : item)),
			);
		},
		setCriterionCommand: (index, command) => {
			setDraftCriteria((current) =>
				current.map((item, itemIndex) => (itemIndex === index ? { ...item, command } : item)),
			);
		},
		setCriterionArgs: (index, args) => {
			setDraftCriteria((current) =>
				current.map((item, itemIndex) => (itemIndex === index ? { ...item, args } : item)),
			);
		},
		addCriterion: () => {
			setDraftCriteria((current) => [...current, { title: "", required: false, command: "", args: "" }]);
		},
		removeCriterion: (index) => {
			setDraftCriteria((current) => current.filter((_, itemIndex) => itemIndex !== index));
		},
		saveDefinition,
		runSelected,
		backToList: () => {
			setSelectedAttempt(null);
			setEditing(false);
		},
	};
}
