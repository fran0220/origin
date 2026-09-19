---
name: vgpu-effects
description: Integrates vgpu effects and exported WGSL helpers with Three TSL. Use when writing shaders, sharing the renderer device, validating headless pixels, or emitting shader artifacts.
---

vgpu is the project's WebGPU effect/compute instrument; three.js is its scene
substrate. This skill is the boundary between them and the workflow that keeps
shaders verifiable by machine instead of by eye.

## Division of labour

- **three.js owns**: the scene graph, entities, materials, cameras, picking,
  asset loading, and any shading *inside* a material — custom surface response
  goes through three's TSL/node materials, never through a vgpu rewrite of the
  material system. Post-processing of the rendered scene frame is also
  three's, through its own `PostProcessing`/TSL pipeline.
- **vgpu owns**: standalone GPU work — fullscreen effect passes into offscreen
  targets, compute (particles, flow fields, bakes), procedural texture
  generation — and **all headless pixel verification**, because vgpu runs the
  same code under Node (Dawn) without a browser.
- Rule of thumb: *drawn on a scene object's surface → three; acting on a whole
  offscreen target or pure computation → vgpu.*
- Every shader that reaches a gate is vgpu-dialect WGSL in `src/shaders/`
  (`check:arch` enforces this; no WGSL strings in TypeScript). TSL stays
  inside preview materials and never becomes a gate subject.

## One device, fixed order

The renderer creates the page's one `GPUDevice`; vgpu **adopts** it. The
scaffold fixes this in `src/core/effects.ts`: `createView()` initializes the
three `WebGPURenderer`, then `adoptDevice(view.gpuDevice)` runs vgpu's
`initFromDevice`. Never call vgpu `init()` in a project — a second device
splits resource lifetimes and makes texture sharing impossible. The canvas
context is the renderer's; vgpu draws only into offscreen `target(...)`s.

`vgpu/three` in 0.4.1 exports **`tslExports`**, not a device-adoption API.
Keep `initFromDevice` for standalone passes; the adapter below is the material
helper path and does not create or own a GPU context.

Composition back into the scene is zero-copy: a vgpu target's color texture
(`target.color.gpu`) is a `GPUTexture` on the shared device, and three ≥ r185
samples it directly through `new ExternalTexture(gpuTexture)` — a material map
or TSL texture node that updates live when the vgpu pass redraws. Reading
pixels back to the CPU per frame is a design smell; bake-once readback at load
is fine.

## Pure WGSL helpers in Three materials

Author a root module such as `src/shaders/surface.wgsl` with direct
`export fn surfaceColor(position: vec3f, timeSeconds: f32) -> vec3f`.
Helpers take values and return values: no stages, resource bindings, void
returns or global `enable`/`requires`/`diagnostic` directives. Three still
owns the material, generated entry points, bindings and render loop.

```ts
import type { Node } from "three/webgpu";
import { tslExports } from "../core/effects.js";
import surfaceModule from "../shaders/surface.wgsl";

type SurfaceExports = {
  surfaceColor: { position: Node; timeSeconds: Node | number };
};
export const { surfaceColor } = tslExports<SurfaceExports>(surfaceModule)(
  "surfaceColor",
);
```

Call `surfaceColor({ position: positionLocal, timeSeconds: simulationTime })`
to set a node material's `colorNode`. `simulationTime` is a TSL uniform updated
from the fixed-step elapsed time, not Three's wall-clock `time` node. Select
functions sharing a material in one call so the adapter shares one include.
Keep the manual contract beside the selection: TypeScript checks that contract,
not the WGSL signature. Build and exercise the actual Three material too.

Always pass the **complete imported artifact**, never `.wgsl` alone. Its
`functionExports` records `name`, `resolvedName` and `parameterNames`; those
authored identities survive resolver namespacing and supported minification.
Private functions are not selectable. Import aliases do not add public names;
re-exports are unsupported. Avoid ambiguous surviving export names and the
reserved `_vgpu_three_` prefix. Inspect adapter errors by their stable `code`
(`TslExportsErrorCode`), not an invented error class.

The Vite loader and ambient `.wgsl` types come from `vgpu/client`. Keep native
artifact identifiers unminified even though the adapter supports minification.

## Time is the simulation's

The game loop is fixed-step and deterministic. Drive vgpu passes from the
simulation's accumulated time (`update(context.elapsed)`), not from
`frameLoop`'s wall clock — a shader animated by wall time diverges under
replay and headless verification. `clock(gpu)` is for scratch experiments
only.

## The shader workflow

1. `npx vgpu docs cat getting-started.md` — the API is versioned with the
   pinned package; the CLI answers offline and is always right for the
   installed version. `npx vgpu docs grep/find <term>` before guessing.
2. Write the WGSL module in `src/shaders/` (entries at the root, shared
   modules in subdirectories; `@vgpu/wgsl-std` ships hash/noise/color/
   fullscreen helpers as imports).
3. `bun run check:wgsl` — resolve and reflect each root. Stage-free roots are
   Three helper modules: the gate selects their surviving `functionExports`
   through the official adapter, checking export ambiguity and supported forms.
   Validation reports whether a real device compiled the module; a skip is not
   GPU evidence. Install Dawn's software renderer with
   `npx vgpu install-software-renderer`, then run
   `VGPU_VALIDATE=require bun run check:wgsl` (set the environment equivalently
   on Windows), or `npx vgpu check <entry.wgsl> --require-validation`.
4. Prove pixels headless before wiring anything: a scratch script over
   `vgpu/node` (`init` → `target` → `effect(...).draw(target)` →
   `target.read()`) renders without a browser; assert on the bytes when the
   expected value is computable, write a PNG when composition needs judging.
   `scripts/render-still.mjs` is the project's standing instrument for this.
   On Linux, if Bun's direct Dawn initialization cannot find the installed
   software renderer, set `VK_ICD_FILENAMES` to the `lvp_icd.json` path printed
   by the installer before `bun run still <entry.wgsl>`. Do not hard-code that
   machine path into the project. CLI validation discovers it independently.
5. Wire into the game through `effectsGpu()` (the adopted context) — uniforms
   set by WGSL name, every declared binding set before first draw.
6. Route every tunable through a uniform fed from `src/tuning.ts`. A constant
   edited inside WGSL is a restart; a uniform on the dial is live tuning.
7. `bun run build` emits `dist/shaders/*.wgsl` — each entry resolved to plain
   standard WGSL. That artifact is the interchange contract with the native
   (Rust/wgpu) target: **identifiers are load-bearing** (the native side
   reflects binding and member names), so never minify or hand-rename them.
   Beside each WGSL file, `.wgsl.json` preserves the complete portable artifact
   (`version`, `wgsl`, `functionExports`) for adapter consumers. Never infer
   exports with regexes or manufacture metadata. Helper-only modules are not
   standalone fullscreen effects; `bun run still <entry.wgsl>` needs a fragment
   entry, not a Three material helper.
8. When a shader misbehaves, do not iterate by eye: extract internal values
   as pixels and diff against a CPU reference
   (`npx vgpu docs cat shader-debugging.docs.md`).

## Performance defaults

From vgpu's performance playbook, the habits worth having from day one: keep
targets as small as the effect allows (a 512² noise field, not a 4K one);
compile pipelines up front (`effect.compile(target)`) instead of paying the
hitch on first draw; `set()` in place each frame rather than rebuilding
resources; ping-pong two targets for iterative passes; batch multi-pass work
in one `frame(gpu, ...)`.

## References on demand

`npx vgpu examples search/show/pull` serves the canonical gallery. Pull into
a scratch directory outside the project tree, read the shape, and write the
project's own strict version — gallery code never lands in `src/` verbatim.
vgpu's remote MCP is deliberately not mounted; the pinned CLI is the same
knowledge, versioned with the package.
