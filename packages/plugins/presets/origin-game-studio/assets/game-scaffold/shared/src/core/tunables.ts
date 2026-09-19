/**
 * The tunable table as the running game reads it, and as the stage may move it.
 *
 * `src/tuning.ts` is the source and the single truth. This wraps it in a
 * working copy the parts read every step, so that moving a value on the stage
 * reshapes what is already standing instead of waiting for a rebuild. The copy
 * is exactly as durable as the page: a relaunch builds it from the module
 * again and every moved value is gone, which is what makes a stage patch
 * volatile rather than a second place a parameter lives.
 *
 * Nothing here writes a file. Keeping a value is an ordinary edit to
 * `src/tuning.ts` that lands as a checkpoint.
 */

/** One publicly tunable parameter of an entity. */
export interface Tunable {
  /** Where the value lives in the table, as `player.coyoteTime`. */
  readonly path: string;
  /** Published by the probe from the table's person-facing key. */
  readonly label?: string;
  /**
   * The range the value means something over. Declare it where there is one:
   * a bounded parameter gets a dial and an unbounded one gets a plain field,
   * because a dial over an invented range is a control that lies about what
   * the value can be.
   */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

/** What one entity publishes, keyed by the word a person would use. */
export type Tunables = Readonly<Record<string, Tunable>>;

type Table = Record<string, unknown>;

function isPlainObject(value: unknown): value is Table {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A working copy. The source module stays frozen and stays the truth. */
function clone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(clone);
  }
  if (isPlainObject(value)) {
    const copy: Table = {};
    for (const [key, held] of Object.entries(value)) {
      copy[key] = clone(held);
    }
    return copy;
  }
  return value;
}

export class TuningTable {
  private readonly values: Table;

  constructor(source: Readonly<Table>) {
    this.values = clone(source) as Table;
  }

  /** What every part is handed. Read it inside `step`, never at spawn. */
  view(): Readonly<Table> {
    return this.values;
  }

  /** The value at a dotted path, or `undefined` where the table has none. */
  read(path: string): unknown {
    let held: unknown = this.values;
    for (const key of path.split(".")) {
      if (!isPlainObject(held)) {
        return undefined;
      }
      held = held[key];
    }
    return held;
  }

  /**
   * Move one value. `false` means the path names nothing, which the stage
   * reports as a refusal rather than creating a parameter the game never had.
   */
  write(path: string, value: unknown): boolean {
    const keys = path.split(".");
    const last = keys.pop();
    if (last === undefined) {
      return false;
    }
    let held: unknown = this.values;
    for (const key of keys) {
      if (!isPlainObject(held)) {
        return false;
      }
      held = held[key];
    }
    if (!isPlainObject(held) || !(last in held)) {
      return false;
    }
    held[last] = value;
    return true;
  }
}
