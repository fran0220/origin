/**
 * The rendering surface, and the hit test the annotation loop resolves
 * through.
 *
 * The view draws and answers "what is under this point". It decides nothing
 * about the game: the camera's framing belongs to `systems/camera`, and every
 * value a person could want to feel differently belongs to `src/tuning.ts`.
 * The numbers here are the ones a renderer needs to exist at all.
 *
 * The renderer is three's WebGPURenderer and it owns the page's one
 * `GPUDevice`; `core/effects` adopts that device rather than creating a
 * second one. Where the browser has no WebGPU the renderer falls back to
 * WebGL and `gpuDevice` stays `null`. The device is this class's own
 * member, not part of the `View` contract: nothing above `core/` may reach
 * for it, and the 2D substrate has none.
 */

import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  WebGPURenderer,
  type Object3D,
} from "three/webgpu";

import type { GameContext, View } from "./contracts.js";
import { adoptDevice, disposeEffects } from "./effects.js";
import type { PickResult } from "./probe.js";

/** What a pickable object carries so a hit resolves to something addressable. */
export interface Pickable {
  readonly entity: string;
  /** Where the person would go to change it, as `player.ts::jump`. */
  readonly source: string | null;
  /**
   * For an `InstancedMesh` (or anything whose hit carries an `instanceId`):
   * the entity behind one instance. A thousand trees are one mesh and one
   * mark; a hit on the four-hundredth resolves to that tree's entity, never
   * to the mesh. `null` is an instance no entity claims — scenery — and the
   * point resolves to nothing rather than to the mesh's own entity.
   */
  readonly instance?: (index: number) => string | null;
}

export class WebView implements View {
  readonly canvas: HTMLCanvasElement;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;

  private readonly renderer: WebGPURenderer;
  private lastDraws = 0;
  private readonly raycaster = new Raycaster();
  private readonly point = new Vector2();
  private readonly pickable = new Map<Object3D, Pickable>();

  private readonly onResize = (): void => this.resize();

  private constructor(canvas: HTMLCanvasElement, renderer: WebGPURenderer) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.camera = new PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    this.resize();
    globalThis.addEventListener("resize", this.onResize);
  }

  /** The backend must settle (device or WebGL fallback) before first draw. */
  static async create(canvas: HTMLCanvasElement): Promise<WebView> {
    const renderer = new WebGPURenderer({ canvas, antialias: true });
    await renderer.init();
    return new WebView(canvas, renderer);
  }

  /**
   * The one `GPUDevice` the renderer owns, or `null` on the WebGL fallback.
   * `core/effects` adopts it; nothing else may create a second device.
   */
  get gpuDevice(): GPUDevice | null {
    const backend = (
      this.renderer as unknown as { backend?: { device?: GPUDevice } }
    ).backend;
    return backend?.device ?? null;
  }

  /** Register what a hit on `object` means. Unregistered geometry is scenery,
   * and a point that lands on scenery resolves to nothing rather than to the
   * nearest guess. */
  markPickable(object: Object3D, as: Pickable): void {
    this.pickable.set(object, as);
  }

  unmarkPickable(object: Object3D): void {
    this.pickable.delete(object);
  }

  resize(): void {
    const width = this.canvas.clientWidth || this.canvas.width;
    const height = this.canvas.clientHeight || this.canvas.height;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Draw calls the renderer issued on its last frame — the 3D draw-call budget's number. */
  get draws(): number {
    return this.lastDraws;
  }

  draw(_alpha: number, _context: GameContext): void {
    this.renderer.render(this.scene, this.camera);
    this.lastDraws = this.renderer.info.render.drawCalls;
  }

  pick(x: number, y: number): PickResult | null {
    if (this.pickable.size === 0) {
      return null;
    }
    const bounds = this.canvas.getBoundingClientRect();
    this.point.set(
      ((x - bounds.left) / bounds.width) * 2 - 1,
      -((y - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.point, this.camera);
    for (const hit of this.raycaster.intersectObjects([...this.pickable.keys()], true)) {
      let node: Object3D | null = hit.object;
      while (node !== null) {
        const marked = this.pickable.get(node);
        if (marked !== undefined) {
          const world: readonly [number, number, number] = [hit.point.x, hit.point.y, hit.point.z];
          if (marked.instance !== undefined && hit.instanceId !== undefined) {
            const entity = marked.instance(hit.instanceId);
            return entity === null ? null : { entity, world, source: marked.source };
          }
          return { entity: marked.entity, world, source: marked.source };
        }
        node = node.parent;
      }
    }
    return null;
  }

  dispose(): void {
    globalThis.removeEventListener("resize", this.onResize);
    disposeEffects();
    this.renderer.dispose();
  }
}

/** The page's one canvas. The deploy contract is `index.html` at the root. */
export async function createView(): Promise<WebView> {
  const canvas = document.querySelector<HTMLCanvasElement>("canvas#stage");
  if (canvas === null) {
    throw new Error("index.html has no <canvas id=\"stage\">, which is the page's deploy contract");
  }
  const view = await WebView.create(canvas);
  const device = view.gpuDevice;
  if (device !== null) {
    await adoptDevice(device);
  }
  return view;
}
