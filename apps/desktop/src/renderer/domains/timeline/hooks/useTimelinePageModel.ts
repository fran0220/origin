import { useOwnedHeaderTitleHidden } from "@shared/hooks/useOwnedHeaderTitleHidden";
import { useSurfaceActive } from "@shared/surface-active";
import type { MainlineCheckpoint } from "@vetta/runtime-checkpoints";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { nodeHash, projectCheckpointGraph, type TimelineGraph } from "../checkpoint-graph";

export interface TimelinePageLabels {
	readonly title: string;
	readonly subtitle: string;
	readonly emptyTitle: string;
	readonly emptyDesc: string;
	readonly revert: string;
	readonly rerun: string;
	readonly conversationHint: string;
	readonly intent: string;
	readonly commit: string;
	readonly files: string;
	readonly verification: string;
	readonly error: string;
	readonly noVerification: string;
	readonly revertTitle: string;
	readonly revertBody: string;
	readonly phase: Record<"verifying" | "reverting" | "settled" | "failed", string>;
	readonly decision: Record<"kept" | "reverted", string>;
}

export interface TimelinePageModel {
	readonly loading: boolean;
	readonly error: string | undefined;
	readonly checkpoints: readonly MainlineCheckpoint[];
	readonly graph: TimelineGraph;
	readonly selected: MainlineCheckpoint | undefined;
	readonly labels: TimelinePageLabels;
	readonly select: (hash: string) => void;
	readonly revertSelected: () => Promise<void>;
	readonly rerunSelected: () => Promise<void>;
	readonly canRevert: boolean;
	readonly canRerun: boolean;
}

export function useTimelinePageModel(): TimelinePageModel {
	const { t } = useTranslation("timeline");
	useOwnedHeaderTitleHidden(useSurfaceActive());
	const [checkpoints, setCheckpoints] = useState<readonly MainlineCheckpoint[]>([]);
	const [selectedId, setSelectedId] = useState<string | undefined>();
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>();

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			const listed = await window.vetta.checkpoints.list();
			setCheckpoints(listed);
			setError(undefined);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const graph = useMemo(() => projectCheckpointGraph(checkpoints), [checkpoints]);
	const selected = checkpoints.find((checkpoint) => checkpoint.id === selectedId) ?? checkpoints[0];

	const labels = useMemo<TimelinePageLabels>(
		() => ({
			title: t("page.title"),
			subtitle: t("page.subtitle"),
			emptyTitle: t("empty.title"),
			emptyDesc: t("empty.desc"),
			revert: t("actions.revert"),
			rerun: t("actions.rerun"),
			conversationHint: t("actions.conversationRevertHint"),
			intent: t("detail.intent"),
			commit: t("detail.commit"),
			files: t("detail.files"),
			verification: t("detail.verification"),
			error: t("detail.error"),
			noVerification: t("detail.noVerification"),
			revertTitle: t("confirm.revertTitle"),
			revertBody: t("confirm.revertBody"),
			phase: {
				verifying: t("phase.verifying"),
				reverting: t("phase.reverting"),
				settled: t("phase.settled"),
				failed: t("phase.failed"),
			},
			decision: {
				kept: t("decision.kept"),
				reverted: t("decision.reverted"),
			},
		}),
		[t],
	);

	const select = useCallback(
		(hash: string) => {
			const match = checkpoints.find((checkpoint) => nodeHash(checkpoint) === hash || checkpoint.id === hash);
			if (match) setSelectedId(match.id);
		},
		[checkpoints],
	);

	const revertSelected = useCallback(async () => {
		if (!selected) return;
		await window.vetta.checkpoints.revert(selected.projectKey, selected.id);
		await refresh();
	}, [refresh, selected]);

	const rerunSelected = useCallback(async () => {
		if (!selected) return;
		await window.vetta.checkpoints.rerunVerification(selected.projectKey, selected.id);
		await refresh();
	}, [refresh, selected]);

	return {
		loading,
		error,
		checkpoints,
		graph,
		selected,
		labels,
		select,
		revertSelected,
		rerunSelected,
		canRevert: selected?.phase === "settled" && selected.decision === "kept" && selected.landed !== undefined,
		canRerun:
			(selected?.verification.length ?? 0) > 0 &&
			selected !== undefined &&
			(selected.phase === "settled" || selected.phase === "failed") &&
			selected.decision !== "reverted",
	};
}
