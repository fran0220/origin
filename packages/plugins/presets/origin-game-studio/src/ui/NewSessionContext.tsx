import { useTranslation, type PluginNewSessionContext } from "@vetta-org/plugin-sdk";
import { GAME_GENRES, type GameGenre } from "../genres";

export function NewSessionContext({ context }: { context: PluginNewSessionContext }) {
	const { t } = useTranslation();

	const pickGenre = (genre: GameGenre | null) => {
		const idea = context.draft.trim();
		const line = genre
			? t("newSession.prompt.genre", { idea: idea || t("newSession.ideaPlaceholder"), genre: t(`genre.${genre}`) })
			: t("newSession.prompt.unsure", { idea: idea || t("newSession.ideaPlaceholder") });
		context.composer.insertText(line, { position: idea ? "end" : "start" });
	};

	return (
		<div className="flex flex-col gap-4 p-2">
			<div className="text-sm font-medium">{t("newSession.ideaLabel")}</div>
			<p className="text-sm text-muted-foreground">{context.draft.trim() || t("newSession.ideaHint")}</p>
			<ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
				{GAME_GENRES.map((genre) => (
					<li key={genre}>
						<button
							type="button"
							className="w-full rounded-lg border border-border bg-card p-3 text-left text-sm hover:bg-accent"
							onClick={() => pickGenre(genre)}
						>
							<div className="font-medium">{t(`genre.${genre}`)}</div>
							<div className="text-xs text-muted-foreground">{t(`genreLead.${genre}`)}</div>
						</button>
					</li>
				))}
				<li>
					<button
						type="button"
						className="w-full rounded-lg border border-dashed border-border p-3 text-left text-sm"
						onClick={() => pickGenre(null)}
					>
						<div className="font-medium">{t("genre.unsure")}</div>
						<div className="text-xs text-muted-foreground">{t("genre.unsureHint")}</div>
					</button>
				</li>
			</ul>
		</div>
	);
}
