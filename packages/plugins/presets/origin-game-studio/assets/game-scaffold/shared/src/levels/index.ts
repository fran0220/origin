/**
 * `levels/` — the home of level data and its readers.
 *
 * A level is data, not code: a Tiled JSON map on the 2D substrate, a glTF
 * scene on the 3D one, or the game's own format. The manifest's `data`
 * entries point at the files; a reader here turns one into the tiles, the
 * spawn points and the triggers the `play` scene stands up through the
 * entity registry. The reader is the registry's (`canvas2d/tiled-import`,
 * `three/level-loader`) or the project's own; either way this table is where
 * a level id resolves to an asset, so the scene, the save system and the
 * stage's level readout all name a level the same way.
 *
 * No level is shipped. A table with no entries is a game with no levels yet,
 * which the design graph says out loud; a sample level here would be an
 * answer the design did not give.
 */

/** One level: the id the game uses and the manifest asset holding its data. */
export interface LevelRef {
  readonly id: string;
  /** A `data` entry's id in `src/assets/manifest.ts`. */
  readonly asset: string;
}

export const levels: Readonly<Record<string, LevelRef>> = {};
