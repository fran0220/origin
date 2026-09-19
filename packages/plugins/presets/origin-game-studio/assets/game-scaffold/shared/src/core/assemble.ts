/**
 * Assembly: the one place the parts are joined, and the place a missing part
 * detonates.
 *
 * Every system is loaded, then started here, before a single frame runs. A
 * game whose audio seam is unbuilt fails on the first launch with
 * `systems/audio is not implemented` rather than on the day someone notices
 * there is no sound; a game whose physics engine is still compiling never
 * steps, because assembly does not return until it has.
 */

import type { AssetLoader } from "./assets.js";
import type {
  EntityRegistry,
  GameContext,
  InputSystem,
  PhysicsSystem,
  Scene,
  SceneId,
  SceneTable,
  System,
  View,
} from "./contracts.js";
import { FixedStepLoop, type Simulation } from "./loop.js";
import { announceReady } from "./platform.js";
import { installProbe, type InjectedInput, type PickResult } from "./probe.js";
import { installProbeBridge } from "./probe-bridge.js";
import { Rng } from "./rng.js";
import { TuningTable, type Tunable } from "./tunables.js";

export interface Parts {
  readonly seed: number;
  readonly scenes: SceneTable;
  readonly systems: readonly System[];
  readonly entities: EntityRegistry;
  readonly tuning: Readonly<Record<string, unknown>>;
  readonly view: View | null;
  readonly assets: AssetLoader | null;
}

export interface Game extends Simulation {
  readonly loop: FixedStepLoop;
  /** What every part was handed, so the page's own chrome can be given it too. */
  readonly context: GameContext;
  advance(steps: number): number;
  start(): void;
  state(): unknown;
  input(event: InjectedInput): boolean;
  pick(x: number, y: number): PickResult | null;
  entity(id: string): Readonly<Record<string, unknown>> | null;
  bounds(id: string): Readonly<Record<string, Tunable>> | null;
  patch(id: string, parameter: string, value: unknown): boolean;
}

/** The scene a game always begins in. Which scenes exist is fixed; what they
 * do is the game's. */
const FIRST_SCENE: SceneId = "boot";

/** The physics seam's name, for the snapshot state readback carries when it exists. */
const PHYSICS = "systems/physics";

/**
 * The fixed head of every state readback. A telemetry assertion is written
 * against these names once and holds on every project; what follows them in
 * `state()` is the game's own.
 */
export interface Timings {
  /** Milliseconds the last `step` took. */
  readonly step: number;
  /** Milliseconds the last `render` took, `0` while headless. */
  readonly render: number;
  /** Entities alive in the registry. */
  readonly entities: number;
  /** Draw operations the view counted on its last frame, `0` while headless. */
  readonly draws: number;
}

const millisecondsNow = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();

export async function assemble(parts: Parts): Promise<Game> {
  const rng = new Rng(parts.seed);
  // The working copy the parts read every step. `src/tuning.ts` stays the
  // source; a value moved from the stage lives here and dies with the page.
  const tuning = new TuningTable(parts.tuning);
  const systems = new Map<string, System>();
  for (const system of parts.systems) {
    if (systems.has(system.name)) {
      throw new Error(`${system.name} is registered twice`);
    }
    systems.set(system.name, system);
  }

  let scene: Scene | null = null;
  let pending: SceneId | null = FIRST_SCENE;

  const context: GameContext = {
    rng,
    assets: parts.assets,
    view: parts.view,
    tuning: tuning.view(),
    entities: parts.entities,
    system<T extends System>(name: string): T {
      const found = systems.get(name);
      if (found === undefined) {
        throw new Error(`${name} is not assembled into this game`);
      }
      return found as T;
    },
    goTo(next: SceneId): void {
      pending = next;
    },
  };

  const settle = (): void => {
    while (pending !== null) {
      const next = pending;
      pending = null;
      scene?.exit(context);
      scene = parts.scenes[next]();
      scene.enter(context);
    }
  };

  // Engines load first, together, and nothing starts until every one has:
  // a wasm world that arrived after the first step is a step that never
  // happened in one run and did in the next.
  await Promise.all(parts.systems.map((system) => system.load?.()));
  for (const system of parts.systems) {
    system.start(context);
  }
  settle();

  let stepMilliseconds = 0;
  let renderMilliseconds = 0;

  const simulation: Simulation = {
    step(dt: number): void {
      const began = millisecondsNow();
      for (const system of parts.systems) {
        system.step(dt, context);
      }
      scene?.step(dt, context);
      settle();
      stepMilliseconds = millisecondsNow() - began;
    },
    render(alpha: number): void {
      const began = millisecondsNow();
      scene?.render(alpha, context);
      if (parts.view === null) {
        return;
      }
      parts.view.draw(alpha, context);
      renderMilliseconds = millisecondsNow() - began;
      // Only here is a frame known to have been drawn, which is the one
      // moment the platform's loading screen may be dismissed.
      announceReady(true);
    },
  };

  const timings = (): Timings => ({
    step: stepMilliseconds,
    render: renderMilliseconds,
    entities: parts.entities.all().length,
    draws: parts.view?.draws ?? 0,
  });

  // The physics seam, when the accepted design kept it: its bodies are state.
  const physics = systems.get(PHYSICS) as PhysicsSystem | undefined;

  const loop = new FixedStepLoop(simulation);

  /** What one entity publishes, or `null` when nothing is spawned by that id. */
  const declared = (id: string): Readonly<Record<string, Tunable>> | null =>
    parts.entities.get(id)?.tunables ?? null;

  const game: Game = {
    loop,
    context,
    step: (dt) => simulation.step(dt),
    render: (alpha) => simulation.render(alpha),
    advance: (steps) => loop.advance(steps),
    start: () => loop.start(),
    state: () => ({
      tick: loop.tick,
      seed: parts.seed,
      scene: scene?.id ?? null,
      timings: timings(),
      entities: parts.entities.all().map((entity) => ({
        id: entity.id,
        kind: entity.kind,
        at: entity.transform?.() ?? null,
      })),
      physics: physics?.snapshot() ?? null,
    }),
    input: (event) => context.system<InputSystem>("systems/input").inject(event),
    pick: (x, y) => parts.view?.pick(x, y) ?? null,
    entity: (id) => {
      const tunables = declared(id);
      if (tunables === null) {
        return null;
      }
      const read: Record<string, unknown> = {};
      for (const [name, tunable] of Object.entries(tunables)) {
        read[name] = tuning.read(tunable.path);
      }
      return read;
    },
    bounds: (id) => declared(id),
    // Only a declared parameter moves, and only in this page's working copy.
    // A name nobody published is refused rather than invented, because a
    // parameter the game does not read is a dial that does nothing.
    patch: (id, parameter, value) => {
      const tunable = declared(id)?.[parameter];
      return tunable === undefined ? false : tuning.write(tunable.path, value);
    },
  };

  installProbe({
    loop,
    state: () => game.state(),
    input: (event) => game.input(event),
    pick: (x, y) => game.pick(x, y),
    entity: (id) => game.entity(id),
    bounds: (id) => game.bounds(id),
    patch: (id, parameter, value) => game.patch(id, parameter, value),
  });
  installProbeBridge();

  return game;
}
