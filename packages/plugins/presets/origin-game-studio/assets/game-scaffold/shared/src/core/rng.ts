/**
 * The seeded deterministic random source.
 *
 * Every random draw in the game comes from here and from nowhere else.
 * `Math.random()` would make a stored input script replay to a different
 * world, which would quietly turn every regression assertion into a
 * coin flip.
 */

/** Splitmix-style scrambling, chosen so a short human seed still spreads. */
function scramble(seed: number): number {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

export class Rng {
  private state: number;

  constructor(readonly seed: number) {
    this.state = scramble(seed) || 1;
  }

  /** The whole generator state, so a replay can resume mid-run. */
  save(): number {
    return this.state;
  }

  restore(state: number): void {
    this.state = state >>> 0 || 1;
  }

  /** A fresh generator on a derived seed, for a subsystem that must not
   * perturb the main sequence by drawing from it. */
  fork(label: string): Rng {
    let derived = this.seed;
    for (let index = 0; index < label.length; index += 1) {
      derived = Math.imul(derived ^ label.charCodeAt(index), 0x01000193);
    }
    return new Rng(derived >>> 0);
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [low, high). */
  range(low: number, high: number): number {
    return low + this.next() * (high - low);
  }

  /** Uniform integer in [low, high]. */
  integer(low: number, high: number): number {
    return low + Math.floor(this.next() * (high - low + 1));
  }

  pick<T>(values: readonly T[]): T | undefined {
    return values.length === 0 ? undefined : values[Math.floor(this.next() * values.length)];
  }
}
