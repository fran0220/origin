---
name: threejs-substrate
description: Strict-TypeScript three.js scene-graph hygiene, detail fading and rendering performance for the game substrate.
---

The substrate is three.js under strict TypeScript. These are the practices
that hold across shipped games; they are not style preferences.

## Scene graph

Build the graph once and mutate transforms, not structure. Adding and removing
objects every frame is the usual cause of a frame-time sawtooth that looks
like a physics problem. Pool what churns.

Keep `step(dt)` free of renderer calls and `render()` free of state changes.
A value written during render is a value the next deterministic replay will
not reproduce.

Dispose what you drop: geometries, materials and textures are not garbage
collected by the renderer's caches. A level reload that leaks is invisible
until the fourth reload, which is exactly when the person is playtesting.

## Colour space

Colour and emissive maps are sRGB. Normal, ARM/ORM, height and any data-packed
map are linear. Getting this wrong produces art that is subtly wrong
everywhere and looks like a lighting problem, so it gets chased in the wrong
place for hours. The asset loader already carries these semantics — declare
each texture's role rather than setting the encoding at the call site.

## Detail fading

Fade detail by **screen-space footprint**, not by distance. Use `fwidth` on
the UV or the world position to know how large a texel actually is on screen;
a distance threshold that looks right at one field of view is wrong at
another, and wrong again on a phone.

Fade the **normal map before the albedo**. Normals at a sub-pixel footprint
are noise, and noise reads as sparkle in motion; albedo carries the material's
identity and should survive longest. Reversing this is the most common cause
of a surface that looks fine still and boils when the camera moves.

## Writing a component the dial can move

Every tunable lives in `src/tuning.ts`, and the person moves one from the
tuning panel while the game runs. Whether that does anything is decided by how
you write the component, not by the panel.

**Store what the dice decided; resolve dimensions every step.** When something
spawns, record only what randomness chose — a seat, a jitter, a lean, a delay —
and read every metre, radian and second off the tunable table inside `step`.
A record that captured `height` at spawn is frozen: the pill will read the new
value while the thing standing on screen keeps the old one, which is exactly
the lie parameter univocality exists to prevent. Timestamps are the one thing
worth capturing, because a moment something happened is an event, not a
dimension.

Written that way, dragging a value re-grows what is already standing, and it
does so on a paused frame too, because the update runs on a zero-length frame
like any other. That is the difference between tuning feel and restarting to
see whether a guess was better.

**Declare what is public.** An entity states which of its tunables the probe
may read and write, and that declaration is the whole surface: `read_entity`
answers from it and `patch_entity` refuses anything outside it. Declare a
`min`/`max`/`step` where the value has a real range — the panel draws a slider
for a bounded number and a plain field for an unbounded one, and it will never
invent a range on your behalf.

**A shape that cannot be a transform is rebuilt, not approximated.** Facet
count, taper, bend: hash the values the geometry was built from and regenerate
when the hash changes. A low-poly piece is cheap enough to rebuild outright,
and that is what keeps it a live value rather than a restart-required
constant.

## The physics writing rule

A physics world belongs to the `systems/physics` seam and nowhere else.
Fill the seam from `physics/rapier3d` — Rapier's deterministic wasm build,
vendored at its exact version — and never from memory. A capsule integrated
by hand against a few bounding boxes is the character that catches on every
edge and the one part of the game no dial can tune back to right.

The rule has four parts, and the determinism half of `check:smoke` catches
a break in any of them:

- the engine compiles in the system's `load()` — the one asynchronous
  moment, which assembly awaits before any `start` — and the world is
  created in `start(ctx)` from the seeded run and stepped
  **only** inside `step(dt)` at the fixed step — never from
  `requestAnimationFrame`, never from a clock of its own;
- every body is keyed by a registry entity id; the entity's `transform()`
  reads the body's position and the mesh copies it in `render()` with the
  interpolation alpha — the mesh is a view of the body, never the truth;
- gravity, solver iterations, friction and restitution live in
  `src/tuning.ts` and reach the world through the project's own wiring
  file; the vendored entry's constants are its defaults, not the game's;
- `snapshot()` answers the probe with the bodies as they stand, ordered, so
  a diverging replay is caught in the numbers rather than guessed at from
  the picture.

A character is the entry's kinematic `character(entity, {...})` controller
moved through the world — slopes, steps and ground snapping resolved by the
solver — and never a body-less position with its own collision. Static
geometry comes from the level: `three/level-loader` tags colliders and
`toTrimesh` hands their world-space triangles to a `trimesh` body once on
level entry; the same triangles bake the navmesh.

## The recipe map

The substrate's own middleware lives in the registry's `three/`, `render/`,
`effects/` and `compute/` categories and takes the scene, the renderer or
the shared `GPUDevice` as parameters; the neutral `gameplay/` category
carries the rules the substrate does not care about. Look here before
writing any of these from memory:

- level: `three/level-loader` (a tagged glTF scene → spawns, triggers,
  colliders, walkable meshes, lights) read through `src/levels/`,
  `three/terrain-chunks` for open ground, `three/gltf-cache` and
  `three/instanced-scatter` for what repeats;
- movement: the physics seam's character controller, `three/anim-graph`
  clocked from simulation time and `three/anim-blender` beneath it,
  `three/vehicle-arcade` with its rig for anything on wheels,
  `gameplay/lap-tracker` around a course;
- space: `nav/recast-navmesh` baked from the level's walkable meshes
  (`three-bake.ts`) for pathing and crowds, `gameplay/steering` where a
  navmesh is more than the game needs;
- camera and picture: `three/chase-camera` and `three/orbit-camera` behind
  the `systems/camera` seam, `three/raycast-picker` for the player's own
  selection and interaction prompts (the probe's `pick` stays the view's
  and is never rewired), `three/post-ao` and `three/post-bloom` inside three's own
  `PostProcessing`, `three/day-night-cycle` for a lit world that changes,
  `three/outline-highlight` and `three/screen-shake` for feedback;
- world rules: `gameplay/inventory` and `gameplay/crafting-recipes`,
  `gameplay/save-slots`, `gameplay/tower-targeting` and
  `gameplay/placement-rules` on a grid or a navmesh.

## Living beside vgpu

The page has exactly one `GPUDevice`: the `WebGPURenderer` creates it and
`src/core/effects.ts` hands the same device to vgpu at `createView()`. Never
initialize vgpu independently, and never create a second renderer — sharing
is what makes texture handover free.

The boundary is drawn once and does not move: shading *on* a scene surface is
a three material question (TSL/node materials); whole-target effects,
compute, and procedural texture generation are vgpu's (details in the
`vgpu-effects` skill). Composition back into the scene is
`new ExternalTexture(target.color.gpu)` — a live, zero-copy view of a vgpu
target usable anywhere a three texture is (three ≥ r185). Do not read pixels
back to the CPU to move an image between the two.

Post-processing of the rendered scene frame stays inside three's own
`PostProcessing`/TSL pipeline; vgpu never re-renders or samples three's
canvas frame.

For portable material logic, vgpu 0.4.1's official `vgpu/three` adapter exposes
`tslExports`, also exported by `core/effects.ts`. Write pure direct `export fn`
helpers in root WGSL modules and pass the complete shader import to
`tslExports<Contract>(module)("authoredName")`; call the selected function with
named TSL node/number inputs. Keep a manual TypeScript input contract beside
the call. `functionExports` metadata retains authored names after resolution;
passing just `module.wgsl` loses that identity. This is still a Three node
material, not a standalone vgpu pass. The adapter neither adopts devices nor
replaces `initFromDevice`. The `vgpu-effects` skill covers supported signatures,
artifact emission and validation; compile and exercise the actual material
because selecting a helper alone cannot validate Three's generated stages.

## References on demand

The installed package is its own reference: `node_modules/three/examples/jsm/`
carries controls, loaders and helpers exactly matching the pinned version —
read the source there before searching the web. When the web is needed, pin
documentation and example URLs to the installed release tag; three's API
moves between releases and the live site tracks latest. The retrieval order
across the examples registry, on-disk sources and the web is the
`recipe-craft` skill's.

## Performance

Measure before optimizing, and measure the view that ships. Draw calls,
triangle count and texture memory are three separate ceilings with three
separate fixes; treat "it is slow" as unmeasured until you know which one is
binding.

Instance what repeats. If the game needs to pick individual instances, carry
per-instance ids in the registry from the start — retrofitting instance
identity after the fact means rewriting every system that addresses entities.

Shadow maps, post-processing and transparency are the three usual budget
sinks, in that order. Cutting resolution is a legitimate answer and is
cheaper than cutting content, but say so out loud rather than quietly
lowering it.
