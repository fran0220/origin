/**
 * The rendering surface, and the hit test the annotation loop resolves
 * through.
 *
 * The view draws and answers "what is under this point". It decides nothing
 * about the game: the camera's framing belongs to `systems/camera`, and every
 * value a person could want to feel differently belongs to `src/tuning.ts`.
 * The numbers here are the ones a surface needs to exist at all.
 *
 * This substrate is immediate mode over the browser's Canvas 2D context.
 * There is no retained scene graph: every frame the view clears the surface,
 * applies the camera, and runs the painters in layer order, and each painter
 * draws what its part of the game looks like right now. A painter that wants
 * to be addressable declares a hit region while it paints; the regions live
 * exactly one frame, which is what makes them truthful. Nothing here is a
 * GPU device and nothing above `core/` may want one.
 */

import type { GameContext, View } from "./contracts.js";
import type { PickResult } from "./probe.js";

/** What a hit on a region means, so a point resolves to something addressable. */
export interface Pickable {
  readonly entity: string;
  /** Where the person would go to change it, as `player.ts::jump`. */
  readonly source: string | null;
}

/** An axis-aligned box in world units. */
export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The framing `systems/camera` leaves the view at. World units map to CSS
 * pixels through `zoom`; `x` and `y` are the world point at the surface's
 * centre.
 */
export interface Framing {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * One layer's drawing. Runs inside the camera transform, so a painter draws
 * in world units and never converts. The HUD is DOM, not a painter.
 */
export type Painter = (
  surface: CanvasRenderingContext2D,
  alpha: number,
  context: GameContext,
) => void;

interface Layer {
  readonly order: number;
  readonly paint: Painter;
}

interface Region {
  readonly bounds: Bounds;
  readonly as: Pickable;
}

/** A cached layer: an offscreen surface its owner repaints only when it says so. */
interface CachedLayer {
  readonly canvas: OffscreenCanvas;
  readonly surface: OffscreenCanvasRenderingContext2D;
  width: number;
  height: number;
  stale: boolean;
}

/** The size, in world units, an offscreen layer covers. */
export interface LayerSize {
  readonly width: number;
  readonly height: number;
}

/** What paints a cached layer, in that layer's own units from its top-left. */
export type LayerPainter = (surface: OffscreenCanvasRenderingContext2D) => void;

/** A counter the surface's method calls pass through, so a draw budget is a number. */
function counting<T extends object>(surface: T, counter: { draws: number }): T {
  const bound = new Map<PropertyKey, unknown>();
  return new Proxy(surface, {
    get(target, property) {
      const value = Reflect.get(target, property) as unknown;
      if (typeof value !== "function") {
        return value;
      }
      let wrapped = bound.get(property);
      if (wrapped === undefined) {
        wrapped = (...args: unknown[]): unknown => {
          counter.draws += 1;
          return (value as (...inner: unknown[]) => unknown).apply(target, args);
        };
        bound.set(property, wrapped);
      }
      return wrapped;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value);
    },
  });
}

export class CanvasView implements View {
  readonly canvas: HTMLCanvasElement;

  /** The colour the surface clears to; a scene sets it, the view only uses it. */
  background = "#000000";
  framing: Framing = { x: 0, y: 0, zoom: 1 };

  private readonly surface: CanvasRenderingContext2D;
  private readonly layers: Layer[] = [];
  private readonly regions: Region[] = [];
  private readonly cached = new Map<string, CachedLayer>();
  private readonly counter = { draws: 0 };
  private lastDraws = 0;
  private pixelRatio = 1;

  private readonly onResize = (): void => this.resize();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const surface = canvas.getContext("2d", { alpha: false });
    if (surface === null) {
      throw new Error("the page's canvas refused a 2d context");
    }
    this.surface = counting(surface, this.counter);
    this.resize();
    globalThis.addEventListener("resize", this.onResize);
  }

  /** Context operations the last frame issued — the 2D draw-call budget's number. */
  get draws(): number {
    return this.lastDraws;
  }

  /**
   * An offscreen layer painted once and drawn many times: static
   * backgrounds, tile floors, text a person reads. `paint` runs only on the
   * first call and after `invalidateLayer(name)`; the returned canvas is
   * drawn with `drawImage` in world units like anything else. This is the
   * layer cache the low quality switch stands on — at the low tier a scene
   * paints more through here and less through the live painters. The
   * surface is sized at the current framing's zoom so it stays crisp; a
   * camera that zooms every frame repaints its layers every frame, and
   * should not cache what it zooms.
   */
  layer(name: string, size: LayerSize, paint: LayerPainter): OffscreenCanvas {
    const width = Math.max(1, Math.ceil(size.width * this.pixelRatio * this.framing.zoom));
    const height = Math.max(1, Math.ceil(size.height * this.pixelRatio * this.framing.zoom));
    let cached = this.cached.get(name);
    if (cached === undefined) {
      const canvas = new OffscreenCanvas(width, height);
      const surface = canvas.getContext("2d");
      if (surface === null) {
        throw new Error(`layer ${name} was refused an offscreen 2d context`);
      }
      cached = { canvas, surface, width, height, stale: true };
      this.cached.set(name, cached);
    }
    if (cached.width !== width || cached.height !== height) {
      cached.canvas.width = width;
      cached.canvas.height = height;
      cached.width = width;
      cached.height = height;
      cached.stale = true;
    }
    if (cached.stale) {
      const scale = this.pixelRatio * this.framing.zoom;
      cached.surface.setTransform(scale, 0, 0, scale, 0, 0);
      cached.surface.clearRect(0, 0, size.width, size.height);
      paint(cached.surface);
      cached.stale = false;
    }
    return cached.canvas;
  }

  /** Mark a cached layer for repaint on its next `layer()` call. */
  invalidateLayer(name: string): void {
    const cached = this.cached.get(name);
    if (cached !== undefined) {
      cached.stale = true;
    }
  }

  /** Drop a cached layer entirely — on leaving the level that owned it. */
  dropLayer(name: string): void {
    this.cached.delete(name);
  }

  /** Register a painter. Lower orders draw first and are covered by higher. */
  addPainter(order: number, paint: Painter): void {
    this.layers.push({ order, paint });
    this.layers.sort((a, b) => a.order - b.order);
  }

  removePainter(paint: Painter): void {
    const index = this.layers.findIndex((layer) => layer.paint === paint);
    if (index !== -1) {
      this.layers.splice(index, 1);
    }
  }

  /**
   * Declare, while painting, that `bounds` in world units is `as`. The region
   * lasts one frame. Undeclared paint is scenery, and a point that lands on
   * scenery resolves to nothing rather than to the nearest guess.
   */
  markPickable(bounds: Bounds, as: Pickable): void {
    this.regions.push({ bounds, as });
  }

  resize(): void {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    this.pixelRatio = Math.min(globalThis.devicePixelRatio ?? 1, 2);
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
  }

  /** CSS pixels of the surface, which is what framing is expressed against. */
  get width(): number {
    return this.canvas.width / this.pixelRatio;
  }

  get height(): number {
    return this.canvas.height / this.pixelRatio;
  }

  draw(alpha: number, context: GameContext): void {
    const surface = this.surface;
    this.regions.length = 0;
    this.counter.draws = 0;
    surface.setTransform(1, 0, 0, 1, 0, 0);
    surface.fillStyle = this.background;
    surface.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const scale = this.pixelRatio * this.framing.zoom;
    surface.setTransform(
      scale,
      0,
      0,
      scale,
      this.canvas.width / 2 - this.framing.x * scale,
      this.canvas.height / 2 - this.framing.y * scale,
    );
    for (const layer of this.layers) {
      surface.save();
      layer.paint(surface, alpha, context);
      surface.restore();
    }
    this.lastDraws = this.counter.draws;
  }

  /** The world point under a client point, through the current framing. */
  toWorld(x: number, y: number): readonly [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    const zoom = this.framing.zoom;
    return [
      (x - rect.left - rect.width / 2) / zoom + this.framing.x,
      (y - rect.top - rect.height / 2) / zoom + this.framing.y,
    ];
  }

  pick(x: number, y: number): PickResult | null {
    if (this.regions.length === 0) {
      return null;
    }
    const [wx, wy] = this.toWorld(x, y);
    // Later paint covers earlier paint, so the last declared region wins.
    for (let index = this.regions.length - 1; index >= 0; index -= 1) {
      const { bounds, as } = this.regions[index]!;
      if (
        wx >= bounds.x &&
        wx <= bounds.x + bounds.width &&
        wy >= bounds.y &&
        wy <= bounds.y + bounds.height
      ) {
        return { entity: as.entity, world: [wx, wy], source: as.source };
      }
    }
    return null;
  }

  dispose(): void {
    globalThis.removeEventListener("resize", this.onResize);
    this.layers.length = 0;
    this.regions.length = 0;
    this.cached.clear();
  }
}

/** The page's one canvas. The deploy contract is `index.html` at the root. */
export async function createView(): Promise<CanvasView> {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas#stage");
  if (canvas === null) {
    throw new Error("index.html has no <canvas id=\"stage\">, which is the page's deploy contract");
  }
  return new CanvasView(canvas);
}
