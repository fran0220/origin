---
name: component-forge
description: Produces a deliberately procedural entity, screen element or effect from measured references. Use when the accepted production route needs parametric geometry or path-drawn artwork.
---

A game is built out of units that stand on their own: an entity, a screen, an
effect, a system. This is how one is produced when the reference is a picture
and the output has to be code the dial can move.

## Choose the route before you build

Read the node's specification and `producing-game-assets` first. The accepted
route wins; this skill is only the procedural craft, not a reason to replace
specified generated or imported work. Where the route is still open, compare:

1. **The catalog first.** Search `origin-assets` — CC0 models, PBR materials,
   HDRIs. Download into the project, reference by relative path, keep the
   attribution metadata. A catalog asset is finished work someone else already
   paid for.
2. **Generate.** Shared Generate makes bespoke images, audio and 3D assets.
   Preserve a specifically requested provider/production route. Spending less
   quota is not permission to replace the person's chosen outcome.
3. **Forge third**, and deliberately: build the unit as procedural TypeScript
   when it must be *parametric* — when the person will want to move its
   proportions under the tuning panel, when it repeats at scale as instances,
   or when nothing in the catalog carries the direction the boards settled.

Say which route you took and why. A hero silhouette forged out of primitives
because the catalog was not searched reads as primitives, and the person will
see it before you do.

## The route on each substrate

On `three`, a forged unit is procedural geometry: buffer geometries built
from named parts, materials by role, instanced where it repeats.

On `canvas2d`, a forged unit is a **path-drawn sprite**: a painter that
builds the figure from `Path2D` parts — body, appendage, mark — in world
units off the tunable table, and either draws them every frame or rasterizes
them once into a view layer keyed by the hash of what it was drawn from. The
same decomposition, measurement and gates apply; the geometry is paths
instead of triangles. A catalog or generated sheet still wins for anything
with texture, and the 2D route is chosen for the same three reasons as the
3D one: parametric under the dial, repeated at scale, or unreachable in the
catalog under the settled direction. A pixel-art direction is not forged —
it is generated or drawn, because a path never reads as pixels.

## Decompose before you build

Name the parts and their relationships first, in words: what is a body, what is
an appendage, what repeats, what attaches to what and where. A unit built as
one mesh cannot be animated, cannot be tuned and cannot be reviewed part by
part.

Write the decomposition in the design graph's node specification and refer to
it from the module. Do not make a competing specification beside the source.
A part you did not name is a part no criterion can check.

## Measure the reference; do not eyeball it

Take proportions off the reference rather than guessing them: relative
lengths, widths at named stations, where a feature sits along an axis. Convert
those into the unit's parameters. The whole point of forging is that the
numbers came from somewhere, and a number you invented has no defence when the
person says it looks wrong.

Where the reference cannot answer — a hidden side, an occluded joint — mirror
what is visible and **say that it is a mirror**, or leave it out. Inventing an
unseen side with confidence is the failure this route is most prone to.

Inferred is not measured. Keep the two apart in what you report.

## Gate on executed geometry, never on the code you wrote

Run the unit, render it, and judge the render. The gates that matter here:

- **Silhouette agreement, measured inside the outline.** An outline-only
  comparison is nearly blind: a model with its whole face missing scores about
  the same as the finished one, because the face is not on the outline. Compare
  the interior of the figure, or the measurement will approve work that is not
  there.
- **Flat regions keep their colour.** A region the reference holds as one flat
  colour must come back as one flat colour, within a stated colour distance.
  Gradient creep across a region that should be flat is the usual sign a
  material was chosen by feel.
- **No self-intersection.** Parts that pass through each other read as one
  broken shape from most angles and cannot be rigged. On `canvas2d` the
  same fault is a path whose fill rule swallows a part: winding order is
  checked, not assumed.
- **Chirality is code, not luck.** Left and right are produced by the same
  generator with a sign, and checked as a pair. A hand-placed mirror drifts,
  and a unit whose two sides disagree looks wrong without anyone being able to
  say why. A 2D sprite's facing is one scale sign in the painter, never a
  second drawing.
- **A taper must actually taper.** A sweep whose stations all end at the same
  radius is a valid sweep and a wrong shape. Check that the profile does what
  it claims; a "valid" result is not a correct one.

Every refuted attempt goes to `docs/experiments.md`, as everywhere else in this
project. A gate that failed and was then loosened is the one thing that must
never happen quietly.

## Assemble through the seams that already exist

A produced unit is finished when it is *assembled*, not when it renders:

- an entity registers its kind in `src/entities/registry.ts`; nothing spawns an
  unregistered kind, and the gate says so;
- every tunable number it has lives in `src/tuning.ts`, and the entity declares
  which of them are public so the probe can read and move them;
- it stores what the dice decided and resolves dimensions every step, so the
  person can dial it while it is standing (see the substrate skill's
  writing rule);
- a screen lives under `src/ui/` against the HUD contract, separately from the
  scene it draws over;
- `main.ts` assembles and nothing more.

A unit that cannot be spawned by name, tuned by parameter or reviewed from the
view that ships is not done, however good the still looks.

## Say what the route cannot do

One image cannot reveal a hidden side, and a stylized reconstruction is not a
likeness. Hard-surface objects come out strongest; characters come out
stylized. **"This cannot reach the asked-for fidelity from this reference"** is
a complete and acceptable answer — give it early, with what would be needed
instead, rather than spending ten correction rounds arriving at it.
