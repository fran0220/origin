/**
 * vgpu on the renderer's own device — the effect/compute instrument.
 *
 * The order is fixed and is the page's one-device rule: the renderer creates
 * the one `GPUDevice`, and vgpu *adopts* it through `initFromDevice`. Calling
 * vgpu's `init()` here would stand a second device beside the renderer's and
 * split every resource across two lifetimes. Adoption is non-owning: the
 * device stays the renderer's, and `disposeEffects` releases only vgpu's
 * wrapper.
 *
 * The canvas has one context and it is the renderer's. vgpu work draws into
 * offscreen targets (`target(gpu, ...)`) that the game composites or reads
 * back; it never configures this page's canvas.
 *
 * Shader source lives in `src/shaders/*.wgsl` — never inline in TypeScript —
 * so `bun run check:wgsl` can validate it and `bun run build` can emit the
 * resolved artifact the native target consumes.
 */

import { initFromDevice, type Gpu } from "vgpu";

// Pure WGSL material helpers use the official adapter, not device adoption.
// Pass the complete shader import so authored export/parameter names survive
// resolver namespacing. Three owns the resulting stages and bindings.
export { tslExports, type TslExportsErrorCode } from "vgpu/three";

let adopted: Gpu | null = null;

/** Adopt the renderer's device once. Later calls return the same context. */
export async function adoptDevice(device: GPUDevice): Promise<Gpu> {
  if (adopted === null) {
    adopted = await initFromDevice(device);
  }
  return adopted;
}

export function hasEffects(): boolean {
  return adopted !== null;
}

/** The adopted vgpu context, or a throw naming what is missing. */
export function effectsGpu(): Gpu {
  if (adopted === null) {
    throw new Error(
      "core/effects has no adopted WebGPU device — the renderer fell back to WebGL or this page runs headless",
    );
  }
  return adopted;
}

export function disposeEffects(): void {
  adopted?.dispose();
  adopted = null;
}
