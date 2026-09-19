/**
 * The contracts every layer above the instruments is written against.
 *
 * They live here because the instrument layer is the bottom of the tree: it
 * is imported and never imports upward, so a contract that lived beside its
 * implementations would make the loop that the gate exists to prevent.
 */

import type { AssetLoader } from "./assets.js";
import type { InjectedInput, PickResult, WorldPoint } from "./probe.js";
import type { Rng } from "./rng.js";
import type { Tunables } from "./tunables.js";

/** What every part is handed, and the only way parts reach each other. */
export interface GameContext {
  readonly rng: Rng;
  readonly assets: AssetLoader | null;
  readonly view: View | null;
  /**
   * The one tunable table. Read it *inside* `step`, never at spawn: this is
   * the working copy the stage moves, and a dimension captured once is a
   * dimension the dial can no longer reach.
   */
  readonly tuning: Readonly<Record<string, unknown>>;
  readonly entities: EntityRegistry;
  /** A named system, or a throw naming what is missing. */
  system<T extends System>(name: string): T;
  /** Ask for the next scene; the machine changes it at the step boundary. */
  goTo(scene: SceneId): void;
}

/**
 * The rendering surface. Absent when the simulation runs headless.
 *
 * This is the whole contract, on either substrate: a 2D context and a
 * scene-graph renderer both fit it, and nothing above `core/` learns which
 * one it was handed except through the view's own class.
 */
export interface View {
  readonly canvas: HTMLCanvasElement;
  /**
   * Draw operations the last frame issued, as this substrate counts them:
   * context operations in 2D, renderer draw calls in 3D. The probe publishes
   * it under `timings.draws`, which is what a draw budget is asserted on.
   */
  readonly draws: number;
  resize(): void;
  draw(alpha: number, context: GameContext): void;
  /** The game's own hit test, or `null` where nothing resolves. */
  pick(x: number, y: number): PickResult | null;
  dispose(): void;
}

export interface System {
  /** Its own name, as the gate and the failure message use it. */
  readonly name: string;
  /**
   * The one asynchronous moment a system gets, before anything starts:
   * compiling a wasm engine (Rapier, Recast), decoding an audio context,
   * anything that cannot be synchronous. Assembly awaits every system's
   * `load` and only then calls `start`, so a world exists at `start` and
   * nothing is ever stepped before its engine is ready — headless in the
   * smoke exactly as in the page. Game content (images, levels) is not
   * this: the boot scene loads it through the asset loader while the loop
   * already runs.
   */
  load?(): Promise<void>;
  start(context: GameContext): void;
  step(dt: number, context: GameContext): void;
}

/** One body as the physics world holds it, keyed by the entity it moves. */
export interface BodySnapshot {
  readonly entity: string;
  readonly at: WorldPoint;
  readonly velocity: WorldPoint;
}

/**
 * The physics seam's second duty: the world it owns is state the probe reads
 * back, so a replay that diverges is caught in the bodies and not guessed at
 * from the picture. The world steps only inside `step`, from the seeded run,
 * and every body is keyed by a registry entity id.
 */
export interface PhysicsSystem extends System {
  snapshot(): readonly BodySnapshot[];
}

/**
 * The one system with a second duty: a replayed event must enter the game
 * through exactly the path a person's key press enters it, or a stored input
 * script proves nothing about how the game plays.
 */
export interface InputSystem extends System {
  inject(event: InjectedInput): boolean;
}

export type SceneId = "boot" | "title" | "play" | "pause" | "results";

export interface Scene {
  readonly id: SceneId;
  enter(context: GameContext): void;
  exit(context: GameContext): void;
  step(dt: number, context: GameContext): void;
  render(alpha: number, context: GameContext): void;
}

export type SceneFactory = () => Scene;

export type SceneTable = Readonly<Record<SceneId, SceneFactory>>;

export interface Entity {
  readonly id: string;
  readonly kind: string;
  /**
   * The parameters this entity publishes to the stage, each naming where it
   * lives in `src/tuning.ts`. Declaring one is what lets a person move it on
   * the tuning panel while the game runs; an entity that declares nothing is
   * read-only there, honestly.
   *
   * Publishing a parameter only works if the entity *resolves* it every step.
   * A dimension captured at spawn will not move under the dial, and the panel
   * would then show one value while the thing on screen obeys another.
   */
  readonly tunables?: Tunables;
  /**
   * Where this entity is, in world units — two components in 2D, three in
   * 3D. This is the one position truth: the spatial hash, the minimap, the
   * probe's state readback and a physics body all read it, and none keeps a
   * copy. An entity that is nowhere (a director, a timer) declares nothing.
   */
  transform?(): WorldPoint;
  step(dt: number, context: GameContext): void;
}

export type EntityFactory = (id: string) => Entity;

/**
 * The one place an entity kind becomes buildable.
 *
 * Spawning by registered kind rather than by import is what lets the graph,
 * the probe and the save system all name the same thing the same way.
 */
export class EntityRegistry {
  private readonly kinds = new Map<string, EntityFactory>();
  private readonly live = new Map<string, Entity>();

  register(kind: string, factory: EntityFactory): void {
    if (this.kinds.has(kind)) {
      throw new Error(`entity kind ${kind} is registered twice`);
    }
    this.kinds.set(kind, factory);
  }

  kindNames(): readonly string[] {
    return [...this.kinds.keys()].sort();
  }

  spawn(kind: string, id: string): Entity {
    const factory = this.kinds.get(kind);
    if (factory === undefined) {
      throw new Error(`entity kind ${kind} is not registered in src/entities/registry.ts`);
    }
    const entity = factory(id);
    this.live.set(id, entity);
    return entity;
  }

  despawn(id: string): void {
    this.live.delete(id);
  }

  get(id: string): Entity | undefined {
    return this.live.get(id);
  }

  all(): readonly Entity[] {
    return [...this.live.values()];
  }
}

export interface Hud {
  mount(root: HTMLElement, context: GameContext): void;
  update(context: GameContext): void;
}
