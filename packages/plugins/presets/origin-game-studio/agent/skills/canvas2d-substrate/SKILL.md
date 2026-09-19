---
name: canvas2d-substrate
description: Immediate-mode discipline, resolution handling, layer caches, sprite sheets, hit regions and the GPU upgrade rule for the browser-native 2D canvas substrate.
---

The substrate is the browser's own Canvas 2D context under strict
TypeScript, with no renderer package. These are the practices that hold
across shipped 2D games; they are not style preferences.

## Immediate mode

There is no scene graph. Every frame the view clears the surface, applies the
camera framing, and runs the painters in layer order; each painter draws what
its part of the game looks like *right now*, from state. Nothing is retained
between frames except caches the scene explicitly owns.

That is the whole model, and it is the model to keep. A retained object list
grown on the side, a display list with `dirty` flags, a "just this once"
persistent path — each is a second scene graph the fixed-step loop does not
know about, and it is where the deterministic replay and the drawn frame
start to disagree.

Keep `step(dt)` free of context calls and painters free of state changes. A
painter runs with an interpolation `alpha` and draws between the previous and
current step; it never advances anything. A value written during paint is a
value the next replay will not reproduce.

## Resolution and resize

The view owns the device-pixel-ratio: the canvas's backing store is the CSS
size times the ratio, capped, and the camera transform folds the ratio in so
painters draw in world units and never multiply by it themselves. Cap the
ratio conservatively (the view caps at two) — a 3× phone panel is four times
the fill of a 1.5× one for a sprite nobody can tell apart.

Handle resize by recomputing the backing store and the framing, not by
scaling the drawn result. A canvas stretched by CSS is blurry in exactly the
way a person will call "the graphics look cheap" without being able to say
why.

Pixel-art games disable image smoothing on the context and snap the framing
to whole device pixels; anything else shimmers when the camera moves.

## Layer caches

The 2D context is fast at blitting and slow at *paths*: text, gradients,
shadows and long stroked polylines re-tessellate on every call. Anything
static across many frames — a tiled background, a parallax layer, a label —
is painted once into an `OffscreenCanvas` the scene owns and blitted
thereafter. Invalidate the cache from the state change that made it stale,
never on a timer.

A cache is a scene-owned asset with a lifetime: build it on level entry,
drop it on leave, and rebuild it when the framing's zoom crosses the level
at which the cached resolution stops matching the screen. The view owns the
surfaces: `view.layer(name, size, paint)` builds one, `invalidateLayer`
marks it stale from the state change, `dropLayer` releases it on leave. The
registry's `canvas2d/layer-cache` and `canvas2d/text-cache` are the
hash-keyed forms of the same rule.

## Sprite sheets, tilesets and frames

Declare a sheet in `src/assets/manifest.ts` with its frame grid
(`spritesheet`, `frameWidth`, `frameHeight`) and ask the loader for a frame
by index; never compute a frame rectangle at a draw site. A sheet whose grid
lives in the manifest is one that the stage can list, the level can
preload, and a second entity can share. A tileset is the same declaration
with a `firstId` (`tileset`, `tileWidth`, `tileHeight`) and is read by
global tile id through `tile(id, tileId)`, which is what a Tiled map's
layers index by.

Animation rate is a tunable and belongs in `src/tuning.ts`; the frame index
is derived from simulation time inside `step`, never counted in the painter,
so a replay lands on the same frame.

## Hit regions are how `pick` resolves

The view's `pick` resolves a screen point through the hit regions declared
during the *last* paint, walked last-declared-first because later paint
covers earlier paint. A painter that wants its entity addressable calls
`view.markPickable(bounds, { entity, source })` while it paints, every frame,
in world units. Undeclared paint is scenery, and a point that lands on
scenery resolves to nothing rather than to the nearest guess — that honesty
is what the annotation loop stands on.

Do not build a parallel picking structure. The regions are one frame old at
most and are rebuilt for free by the same code that draws, which is exactly
the property a retained structure loses the first time someone forgets to
update it.

## Text and HUD are DOM

Text a person needs to read — scores, prompts, menus, dialogue — is HTML
and CSS mounted by `src/ui/hud.ts`, never `fillText` on the game canvas.
Canvas text does not reflow, does not localize, is not selectable, is
invisible to the annotation loop's DOM path, and re-rasterizes every frame.
Canvas text is for diegetic marks only: a number that floats off a hit, a
label baked into a cached layer.

## Writing a component the dial can move

Every tunable lives in `src/tuning.ts`, and the person moves one from the
tuning panel while the game runs. Whether that does anything is decided by
how you write the component, not by the panel.

**Store what the dice decided; resolve dimensions every step.** When
something spawns, record only what randomness chose — a seat, a jitter, a
lean, a delay — and read every pixel, radian and second off the tunable table
inside `step`. A record that captured `radius` at spawn is frozen: the pill
will read the new value while the thing on screen keeps the old one, which is
exactly the lie parameter univocality exists to prevent. Timestamps are the
one thing worth capturing, because a moment something happened is an event,
not a dimension.

Written that way, dragging a value re-grows what is already standing, and it
does so on a paused frame too, because the update runs on a zero-length frame
like any other.

**Declare what is public.** An entity states which of its tunables the probe
may read and write, and that declaration is the whole surface: `read_entity`
answers from it and `patch_entity` refuses anything outside it. Declare a
`min`/`max`/`step` where the value has a real range — the panel draws a
slider for a bounded number and a plain field for an unbounded one, and it
will never invent a range on your behalf.

**A cached layer is rebuilt, not approximated.** Hash the tunables a layer
was painted from and repaint when the hash changes. That is what keeps a
tunable that feeds a cache a live value rather than a restart-required
constant.

## The physics writing rule

A physics world belongs to the `systems/physics` seam and nowhere else.
Fill the seam from `physics/rapier2d` — Rapier's deterministic wasm build,
vendored at its exact version — and never from memory: a hand-integrated
capsule with its own gravity and a few `overlaps` checks is the platformer
that feels wrong on every ledge and cannot be tuned back to right.

The rule has four parts, and the determinism half of `check:smoke` catches
a break in any of them:

- the engine compiles in the system's `load()` — the one asynchronous
  moment, which assembly awaits before any `start` — and the world is
  created in `start(ctx)` from the seeded run and stepped
  **only** inside `step(dt)` at the fixed step — never from a frame
  callback, never from a clock of its own;
- every body is keyed by a registry entity id; the entity's `transform()`
  reads the body's position and nothing keeps a copy, so the painter, the
  probe and the replay all see one position;
- gravity, solver iterations, friction and restitution live in
  `src/tuning.ts` and reach the world through the project's own wiring
  file; the vendored entry's constants are its defaults, not the game's;
- `snapshot()` answers the probe with the bodies as they stand, ordered, so
  a diverging replay is caught in the numbers rather than guessed at from
  the picture.

A design with no physics node loses the seam at accept, and a kinematic
mover — the platformer controller, a top-down steering body — is the
entry's `kinematic` kind moved through the world, never a body-less
position integrated beside it. Static geometry comes from the level:
`solidRects` and `edgeChains` off a Tiled layer, added once on level entry.

## The recipe map

The substrate's own middleware lives in the registry's `canvas2d/` category
and takes the context, a `View` layer or the manifest's assets as
parameters; the neutral `gameplay/` category carries the controllers,
boards, decks and targeting the substrate does not care about. Look here
before writing any of these from memory:

- level: `canvas2d/tiled-import` (Tiled JSON → layers, objects, solids,
  edge chains) read through `src/levels/`, painted by
  `canvas2d/tilemap-renderer` into a cached layer per tile layer;
- camera: `canvas2d/camera-2d` (follow, bounds, zoom, shake, world↔screen)
  behind the `systems/camera` seam;
- sprites and feel: `canvas2d/sprite-animator-2d` clocked from simulation
  time, `canvas2d/parallax-layers`, `canvas2d/particles-2d` under the
  tuning ceiling, `canvas2d/lighting-2d` as one composite pass;
- UI chrome drawn on the canvas: `canvas2d/nine-slice`, `canvas2d/text-cache`
  for diegetic marks only — readable text stays DOM;
- movement and rules: `gameplay/platformer-controller-2d` over the physics
  seam, `gameplay/steering` and `gameplay/spatial-hash` for top-down
  crowds, `gameplay/grid-board`, `gameplay/card-deck`, `gameplay/undo-stack`
  and `gameplay/drag-drop` for boards and tables,
  `gameplay/tower-targeting`, `gameplay/placement-rules` and
  `gameplay/wave-spawner` for defense, `gameplay/astar-grid` on tiles.

## The GPU upgrade rule

The 2D context has a ceiling: thousands of sprites, per-sprite blend modes,
or full-screen effects every frame will eventually make the context itself
the frame-time bottleneck. A GPU sprite batcher (PixiJS) exists for that
case, and only for that case.

It enters under exactly these conditions, in order:

1. Telemetry on a **throttled profile** shows the frame budget from
   `src/tuning.ts` is missed, and the instant low switch (layer caches,
   reduced particle ceiling) does *not* recover it — which localizes the cost
   to the context, not to simulation or allocation.
2. The batcher is pinned to **one exact version** in `package.json`, and its
   documentation for *that* version is retrieved through the `recipe-craft`
   ladder before a line is written. Mixed-version API memory is how such a
   library fails silently: the call compiles, the sprite does not draw, and
   nothing says why.
3. It replaces the painting inside `src/core/view.ts` behind the same
   `View` contract — `draw`, `pick`, `markPickable` — so no system, entity
   or scene changes. If adopting it would change a painter's interface, the
   ceiling was misdiagnosed.

Until those hold, the batcher is a dependency the project does not have, and
"it would be faster" is not a measurement. Record the measurement that
justified the upgrade in `docs/experiments.md`.

## References on demand

The browser is its own reference: the `CanvasRenderingContext2D` interface in
`lib.dom.d.ts` and MDN's canvas documentation describe exactly what the
installed TypeScript version types. The retrieval order across the examples
registry, on-disk sources and the web is the `recipe-craft` skill's.

## Performance

Measure before optimizing, and measure the view that ships. Context
operations per frame, path complexity and the number of live offscreen
surfaces are three separate ceilings with three separate fixes; treat "it is
slow" as unmeasured until you know which one is binding.

`drawImage` from a decoded bitmap is the cheap operation; everything that
makes the context rasterize — paths, gradients, shadows, `filter`, text — is
the expensive one. Batch by state: sort painters so consecutive draws share
`globalAlpha`, composite mode and transform, because every state change is a
flush.

Shadows, `filter`, and per-sprite composite modes are the three usual budget
sinks, in that order. Baking a shadow into the sprite is a legitimate answer
and is cheaper than cutting content, but say so out loud rather than quietly
changing the art.
