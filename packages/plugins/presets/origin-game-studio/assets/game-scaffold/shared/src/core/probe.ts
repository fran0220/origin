/**
 * The page-side readback contract the stage stands on.
 *
 * One global object, neutral by name, around the fixed-step skeleton. The
 * stage's single-step control, every deterministic replay, every telemetry
 * sample and the annotation loop's resolution all go through it. Removing a
 * member does not simplify the game; it takes a tool away from the person
 * directing it.
 */

import type { FixedStepLoop } from "./loop.js";
import type { Tunable } from "./tunables.js";

export const PROBE_GLOBAL = "__runtime_probe__";

/** The contract revision this skeleton implements. */
const PROBE_VERSION = 2;

export type KeyAction = "press" | "down" | "up";
export type PointerAction = "click" | "move" | "down" | "up";
/** `none` is a hover move; presses and releases carry a physical button. */
export type PointerButton = "none" | "left" | "middle" | "right";

export interface Modifiers {
  readonly alt: boolean;
  readonly control: boolean;
  readonly platform: boolean;
  readonly shift: boolean;
}

export type InjectedInput =
  | { readonly kind: "key"; readonly key: string; readonly action: KeyAction; readonly modifiers?: Modifiers }
  | { readonly kind: "pointer"; readonly action: PointerAction; readonly x: number; readonly y: number; readonly button: PointerButton }
  | { readonly kind: "wheel"; readonly x: number; readonly y: number; readonly deltaX: number; readonly deltaY: number };

/**
 * Where a pick landed in the game's own space: two components on a 2D
 * substrate, three in 3D. The stage prints what it was given and never
 * pads a plane with a zero it did not measure.
 */
export type WorldPoint = readonly [number, number] | readonly [number, number, number];

/** What a screen point resolved to, when it resolved to anything. */
export interface PickResult {
  /** The registry id of the entity under the point. */
  readonly entity: string;
  readonly world: WorldPoint;
  /** Where the person would go to change it, as `player.ts::jump`. */
  readonly source: string | null;
}

/**
 * What the game gives the probe. Each member is the game's own; the probe
 * only publishes them.
 */
export interface ProbeSource {
  readonly loop: FixedStepLoop;
  /** A JSON-serializable snapshot: entities, timings, events since the last read. */
  state(): unknown;
  /** One event, in the same shape the game's own input layer produces. */
  input(event: InjectedInput): boolean;
  /**
   * A screen point resolved through the game's own hit test. A game that has
   * no hit test yet answers `null`, and the surface says picking is
   * unsupported rather than attaching an annotation to a guess.
   */
  pick(x: number, y: number): PickResult | null;
  /**
   * One entity's published parameters and their current values. `null` is an
   * entity nothing knows about, which the stage reports as a refusal rather
   * than as an entity with no parameters.
   */
  entity(id: string): Readonly<Record<string, unknown>> | null;
  /** What each of those parameters means, so a dial knows its range. */
  bounds(id: string): Readonly<Record<string, Tunable>> | null;
  /**
   * Move one published parameter, for this page only. `false` is a refusal —
   * an entity or a parameter nobody published — and never a silent no-op.
   */
  patch(id: string, parameter: string, value: unknown): boolean;
}

export interface RuntimeProbe {
  readonly version: number;
  tick(): number;
  state(): unknown;
  advance(steps: number): number;
  pause(): boolean;
  resume(): boolean;
  input(event: InjectedInput): boolean;
  pick(x: number, y: number): PickResult | null;
  entity(id: string): Readonly<Record<string, unknown>> | null;
  bounds(id: string): Readonly<Record<string, Tunable>> | null;
  patch(id: string, parameter: string, value: unknown): boolean;
}

export function installProbe(source: ProbeSource): RuntimeProbe {
  const probe: RuntimeProbe = {
    version: PROBE_VERSION,
    tick: () => source.loop.tick,
    state: () => source.state(),
    advance: (steps) => source.loop.advance(steps),
    pause: () => source.loop.pause(),
    resume: () => source.loop.resume(),
    input: (event) => source.input(event),
    pick: (x, y) => source.pick(x, y),
    entity: (id) => source.entity(id),
    bounds: (id) => {
      const bounds = source.bounds(id);
      return bounds === null ? null : Object.fromEntries(
        Object.entries(bounds).map(([key, tunable]) => [key, { ...tunable, label: key }]),
      );
    },
    patch: (id, parameter, value) => source.patch(id, parameter, value),
  };
  (globalThis as Record<string, unknown>)[PROBE_GLOBAL] = probe;
  return probe;
}
