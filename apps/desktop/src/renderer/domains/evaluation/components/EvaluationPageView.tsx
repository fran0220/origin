import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import type { EvaluationAttempt, EvaluationAttemptView, EvaluationDefinition } from "@preload/api";
import { useTranslation } from "react-i18next";
import type { EvaluationDraftCriterion, EvaluationPageModel } from "../hooks/useEvaluationPageModel";

export type EvaluationPageViewProps = EvaluationPageModel;

function outcomeClass(kind: string): string {
	if (kind === "passed") return "bg-emerald-500/15 text-emerald-400";
	if (kind === "failed" || kind === "error") return "bg-destructive/15 text-destructive";
	if (kind === "cancelled" || kind === "budget-limited") return "bg-amber-500/15 text-amber-400";
	return "bg-accent/60 text-muted-foreground";
}

export function EvaluationPageView(model: EvaluationPageViewProps): JSX.Element {
	const { t } = useTranslation("evaluation");
	if (model.selectedAttempt) {
		return <AttemptDetail attempt={model.selectedAttempt} labels={model.labels} onBack={model.backToList} />;
	}
	if (model.editing) {
		return <DefinitionEditor model={model} />;
	}
	return (
		<div className="flex h-full flex-col gap-6 p-6">
			<header className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-xl font-medium text-foreground">{model.labels.title}</h1>
					<p className="mt-1 text-sm text-muted-foreground">{model.labels.subtitle}</p>
				</div>
				<Button onClick={model.startCreate}>{model.labels.newDefinition}</Button>
			</header>
			{model.error ? <p className="text-sm text-destructive">{model.error}</p> : null}
			{model.definitions.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border/50 bg-card/40 p-10 text-center">
					<h2 className="text-base text-foreground">{model.labels.emptyTitle}</h2>
					<p className="max-w-md text-sm text-muted-foreground">{model.labels.emptyDesc}</p>
					<Button onClick={model.startCreate}>{model.labels.emptyAction}</Button>
				</div>
			) : (
				<div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
					<section className="overflow-auto rounded-xl border border-border/50 bg-card/40 p-4">
						<h2 className="mb-3 text-sm font-medium text-foreground">{t("definition.criteria")}</h2>
						<ul className="flex flex-col gap-2">
							{model.definitions.map((definition) => (
								<DefinitionRow
									key={definition.id}
									definition={definition}
									selected={definition.id === model.selectedDefinitionId}
									onSelect={() => model.selectDefinition(definition.id)}
									onRun={model.runSelected}
									runLabel={model.labels.run}
									running={model.running}
								/>
							))}
						</ul>
					</section>
					<section className="overflow-auto rounded-xl border border-border/50 bg-card/40 p-4">
						<h2 className="mb-3 text-sm font-medium text-foreground">{t("attempt.title")}</h2>
						{model.attempts.length === 0 ? (
							<p className="text-sm text-muted-foreground">{t("attempt.empty")}</p>
						) : (
							<ul className="flex flex-col gap-2">
								{model.attempts.map((attempt) => (
									<AttemptRow
										key={attempt.id}
										attempt={attempt}
										onOpen={() => model.selectAttempt(attempt.id)}
									/>
								))}
							</ul>
						)}
					</section>
				</div>
			)}
		</div>
	);
}

function DefinitionRow({
	definition,
	selected,
	onSelect,
	onRun,
	runLabel,
	running,
}: {
	definition: EvaluationDefinition;
	selected: boolean;
	onSelect: () => void;
	onRun: () => void;
	runLabel: string;
	running: boolean;
}): JSX.Element {
	return (
		<li
			className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 ${
				selected ? "border-primary/40 bg-primary/10" : "border-border/40 bg-background/40"
			}`}
		>
			<button type="button" onClick={onSelect} className="flex-1 text-left text-sm text-foreground">
				{definition.title}
			</button>
			{selected ? (
				<Button size="sm" disabled={running} onClick={onRun}>
					{runLabel}
				</Button>
			) : null}
		</li>
	);
}

function AttemptRow({ attempt, onOpen }: { attempt: EvaluationAttempt; onOpen: () => void }): JSX.Element {
	const { t } = useTranslation("evaluation");
	return (
		<li>
			<button
				type="button"
				onClick={onOpen}
				className="flex w-full items-center justify-between rounded-lg border border-border/40 bg-background/40 px-3 py-2 text-left"
			>
				<span className="text-sm text-foreground">{attempt.id}</span>
				<span className={`rounded-md px-2 py-0.5 text-xs ${outcomeClass(attempt.outcome.kind)}`}>
					{t(`outcome.${attempt.outcome.kind}`)}
				</span>
			</button>
		</li>
	);
}

function DefinitionEditor({ model }: { model: EvaluationPageViewProps }): JSX.Element {
	const { t } = useTranslation("evaluation");
	return (
		<div className="flex h-full flex-col gap-4 p-6">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-medium text-foreground">{model.labels.newDefinition}</h1>
				<div className="flex gap-2">
					<Button variant="outline" onClick={model.backToList}>
						{model.labels.back}
					</Button>
					<Button onClick={() => void model.saveDefinition()}>{model.labels.save}</Button>
				</div>
			</div>
			{model.error ? <p className="text-sm text-destructive">{model.error}</p> : null}
			<label className="flex flex-col gap-1 text-sm text-muted-foreground">
				{t("definition.title")}
				<Input
					value={model.draftTitle}
					placeholder={t("definition.titlePlaceholder")}
					onChange={(event) => model.setDraftTitle(event.target.value)}
				/>
			</label>
			<div className="flex flex-col gap-3">
				{model.draftCriteria.map((criterion, index) => (
					<CriterionEditor
						key={criterion.id ?? index}
						criterion={criterion}
						index={index}
						model={model}
					/>
				))}
				<Button variant="outline" onClick={model.addCriterion}>
					{t("definition.addCriterion")}
				</Button>
			</div>
		</div>
	);
}

function CriterionEditor({
	criterion,
	index,
	model,
}: {
	criterion: EvaluationDraftCriterion;
	index: number;
	model: EvaluationPageViewProps;
}): JSX.Element {
	const { t } = useTranslation("evaluation");
	return (
		<div className="rounded-xl border border-border/50 bg-card/40 p-4">
			<div className="mb-3 flex items-center justify-between">
				<span className="text-sm text-foreground">{t("definition.criterionTitle")}</span>
				<Button variant="ghost" onClick={() => model.removeCriterion(index)}>
					{t("definition.removeCriterion")}
				</Button>
			</div>
			<Input value={criterion.title} onChange={(event) => model.setCriterionTitle(index, event.target.value)} />
			<label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
				<input
					type="checkbox"
					checked={criterion.required}
					onChange={(event) => model.setCriterionRequired(index, event.target.checked)}
				/>
				{criterion.required ? t("definition.required") : t("definition.optional")}
			</label>
			<label className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
				{t("definition.commandVerifier")}
				<Input
					value={criterion.command}
					placeholder={t("definition.commandPlaceholder")}
					onChange={(event) => model.setCriterionCommand(index, event.target.value)}
				/>
				<Input
					value={criterion.args}
					placeholder={t("definition.argsPlaceholder")}
					onChange={(event) => model.setCriterionArgs(index, event.target.value)}
				/>
			</label>
		</div>
	);
}

function AttemptDetail({
	attempt,
	labels,
	onBack,
}: {
	attempt: EvaluationAttemptView;
	labels: EvaluationPageViewProps["labels"];
	onBack: () => void;
}): JSX.Element {
	const { t } = useTranslation("evaluation");
	const evidenceById = new Map(attempt.evidence.map((item) => [item.id, item]));
	return (
		<div className="flex h-full flex-col gap-4 p-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-xl font-medium text-foreground">{attempt.definition.title}</h1>
					<p className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs ${outcomeClass(attempt.attempt.outcome.kind)}`}>
						{t(`outcome.${attempt.attempt.outcome.kind}`)}
					</p>
				</div>
				<Button variant="outline" onClick={onBack}>
					{labels.back}
				</Button>
			</div>
			<section className="flex flex-col gap-3">
				<h2 className="text-sm font-medium text-foreground">{t("finding.title")}</h2>
				{attempt.attempt.findings.map((finding) => {
					const criterion = attempt.definition.criteria.find((item) => item.id === finding.criterionId);
					return (
						<article key={finding.criterionId} className="rounded-xl border border-border/50 bg-card/40 p-4">
							<div className="flex items-center justify-between">
								<h3 className="text-sm text-foreground">{criterion?.title ?? finding.criterionId}</h3>
								<span className={`rounded-md px-2 py-0.5 text-xs ${outcomeClass(finding.state)}`}>
									{t(`outcome.${finding.state}`)}
								</span>
							</div>
							<p className="mt-1 text-xs text-muted-foreground">
								{criterion?.required ? t("finding.required") : t("finding.optional")}
							</p>
							<ul className="mt-3 flex flex-col gap-1">
								{finding.evidenceIds.length === 0 ? (
									<li className="text-sm text-muted-foreground">{t("finding.noEvidence")}</li>
								) : (
									finding.evidenceIds.map((evidenceId) => {
										const evidence = evidenceById.get(evidenceId);
										return (
											<li key={evidenceId}>
												<a
													href={`#evidence-${evidenceId}`}
													className="text-sm text-primary underline-offset-2 hover:underline"
												>
													{t("finding.openEvidence")}: {evidence?.summary ?? evidenceId}
												</a>
											</li>
										);
									})
								)}
							</ul>
							{finding.note ? (
								<p className="mt-2 text-sm text-muted-foreground">
									{t("finding.note")}: {finding.note}
								</p>
							) : null}
						</article>
					);
				})}
			</section>
			<section className="flex flex-col gap-2">
				<h2 className="text-sm font-medium text-foreground">{t("finding.evidence")}</h2>
				{attempt.evidence.map((evidence) => (
					<article
						id={`evidence-${evidence.id}`}
						key={evidence.id}
						className="rounded-xl border border-border/50 bg-card/40 p-4 text-sm text-muted-foreground"
					>
						<p className="text-foreground">{evidence.summary}</p>
						<p>{evidence.source.kind}</p>
						<p>{evidence.digest}</p>
					</article>
				))}
			</section>
		</div>
	);
}
