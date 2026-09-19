import { GitGraphCanvas } from "@origin-org/ui/git-graph";
import type { MainlineCheckpoint } from "@origin/runtime-checkpoints";
import type { TimelineGraph } from "../checkpoint-graph";
import { nodeHash } from "../checkpoint-graph";
import type { TimelinePageLabels } from "../hooks/useTimelinePageModel";

export interface TimelinePageViewProps {
	readonly loading: boolean;
	readonly error: string | undefined;
	readonly checkpoints: readonly MainlineCheckpoint[];
	readonly graph: TimelineGraph;
	readonly selected: MainlineCheckpoint | undefined;
	readonly labels: TimelinePageLabels;
	readonly canRevert: boolean;
	readonly canRerun: boolean;
	readonly onSelect: (hash: string) => void;
	readonly onRevert: () => void;
	readonly onRerun: () => void;
}

export function TimelinePageView({
	loading,
	error,
	checkpoints,
	graph,
	selected,
	labels,
	canRevert,
	canRerun,
	onSelect,
	onRevert,
	onRerun,
}: TimelinePageViewProps): JSX.Element {
	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="border-border/60 flex shrink-0 flex-col gap-1 border-b px-6 py-4">
				<h1 className="text-lg font-medium">{labels.title}</h1>
				<p className="text-muted-foreground text-sm">{labels.subtitle}</p>
			</header>
			{error ? <p className="text-destructive px-6 py-3 text-sm">{error}</p> : null}
			{!loading && checkpoints.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
					<p className="text-base font-medium">{labels.emptyTitle}</p>
					<p className="text-muted-foreground text-sm">{labels.emptyDesc}</p>
				</div>
			) : (
				<div className="flex min-h-0 flex-1">
					<div className="min-w-0 flex-1">
						<GitGraphCanvas
							nodes={graph.nodes}
							selectedHash={selected ? nodeHash(selected) : null}
							onSelect={onSelect}
							feedbackEdges={graph.feedbackEdges}
							title={labels.title}
						/>
					</div>
					{selected ? (
						<aside className="border-border/60 flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l px-4 py-4 text-sm">
							<p>
								<span className="text-muted-foreground">{labels.intent}</span>
								<br />
								{selected.intent}
							</p>
							<p>
								{labels.phase[selected.phase]}
								{selected.decision ? ` · ${labels.decision[selected.decision]}` : ""}
							</p>
							{selected.landed ? (
								<p>
									<span className="text-muted-foreground">{labels.commit}</span>
									<br />
									<code>{selected.landed.commit.slice(0, 12)}</code>
									<br />
									{labels.files}: {selected.landed.paths.length} (+{selected.landed.added} / -{selected.landed.removed})
								</p>
							) : null}
							<section>
								<p className="text-muted-foreground mb-1">{labels.verification}</p>
								{selected.verification.length === 0 ? (
									<p>{labels.noVerification}</p>
								) : (
									<ul className="space-y-1">
										{selected.verification.map((step) => (
											<li key={`${step.command}:${step.cwd}`}>
												<code>{step.command}</code> · {step.state.state}
											</li>
										))}
									</ul>
								)}
							</section>
							{selected.error ? (
								<p>
									<span className="text-muted-foreground">{labels.error}</span>
									<br />
									{selected.error}
								</p>
							) : null}
							<p className="text-muted-foreground text-xs">{labels.conversationHint}</p>
							<div className="mt-auto flex gap-2">
								<button
									type="button"
									className="border-border rounded-md border px-3 py-1.5 disabled:opacity-50"
									disabled={!canRevert}
									onClick={onRevert}
								>
									{labels.revert}
								</button>
								<button
									type="button"
									className="border-border rounded-md border px-3 py-1.5 disabled:opacity-50"
									disabled={!canRerun}
									onClick={onRerun}
								>
									{labels.rerun}
								</button>
							</div>
						</aside>
					) : null}
				</div>
			)}
		</div>
	);
}
