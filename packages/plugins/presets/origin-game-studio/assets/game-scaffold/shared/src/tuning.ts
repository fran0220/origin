/**
 * Every tunable number in this game, and nothing else.
 *
 * This file exists so that "make the jump feel floatier" has exactly one
 * place to happen. A value that also sits inline in an entity is a lie the
 * live tuning path tells: the parameter pill shows one number while the game
 * obeys another. `bun run check:arch` refuses tunable numbers everywhere but
 * here for that reason alone.
 *
 * Keep the names the words a person would use.
 */

export const tuning = {
  /** The seed every deterministic replay starts from. */
  seed: 1,
} as const;

export type Tuning = typeof tuning;
