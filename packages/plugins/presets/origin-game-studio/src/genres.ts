export const GAME_GENRES = [
	"platformer",
	"top-down-action",
	"first-person-exploration",
	"racing",
	"puzzle-board",
	"card-deck",
	"tower-defense",
	"survival-crafting",
] as const;

export type GameGenre = (typeof GAME_GENRES)[number];

export function isGameGenre(value: string): value is GameGenre {
	return (GAME_GENRES as readonly string[]).includes(value);
}
