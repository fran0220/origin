---
name: recipe-craft
description: Working with verified example modules — the retrieval ladder for reference code, the vendor-not-depend discipline for adopting registry entries, and distilling proven project code back into registry contributions.
---

Reference code has a retrieval ladder and a custody rule. This skill keeps
found code from silently becoming load-bearing code.

## Research is not a code or asset library

Discover available tools first. The selected `origin-game-knowledge` serves
gameplay research — sourced records, genre profiles, conventions, concept
norms, procedures and formulas — and nothing on it is code to vendor. Its
tools, its depth ladder and where its answers land are the
`gameplay-research` skill's; a knowledge record is never a rung on the
retrieval ladder below.

`origin-assets` supplies binary art through its asset search/detail/files/fetch
tools (`assets_search_3d` for models). `origin-examples` supplies code at the
public `https://registry.origingame.dev/mcp`. The public research and code
services need no credential; the asset service has its own configuration.
Use mounted services rather than copying credentials or inventing endpoints.

## The retrieval ladder

When a mechanic, effect, or UI pattern is needed, look in this order:

1. **The examples registry** (the `origin-examples` service): verified,
   vendorable modules — `registry_search` with intent words, `registry_get`
   for the full entry. Every entry passed real gates (typecheck against
   pinned dependency versions, WGSL validation under Dawn where applicable)
   before it was admitted, so it is the only tier whose code may land in the
   project directly.
2. **On-disk reference source**, which depends on the substrate:
   - on `three`, `node_modules/three/examples/jsm/` ships in the installed
     package — controls, loaders, utils, math helpers — exactly matching the
     pinned three version. Read the source; import from `three/addons/...`
     when the module is a real dependency-shaped utility (loaders,
     controls), or re-implement the idea strictly when it is pattern-shaped
     code;
   - on `canvas2d`, the installed TypeScript's `lib.dom.d.ts` is the exact
     type of the context the game draws with. There is no example package
     to read, and that is the point: a 2D mechanic is written against the
     browser API directly.
3. **Pinned documentation**: when browsing threejs.org examples or docs, pin
   the URL to the installed release tag rather than trusting the live site's
   latest — APIs move between releases. For the 2D context, MDN's canvas
   pages document a stable API and need no pin; for a GPU sprite batcher the
   `canvas2d-substrate` skill's upgrade rule admits, pin its documentation to
   the exact version in `package.json` before reading a line of it.
4. **The open web**, last, with the usual skepticism about version drift.

## The categories are the middleware map

The registry is shelved by what a category owns, and the shelf is where a
missing part is looked for before anything is written from memory:

- `gameplay/`, `input/`, `ui/` and `audio/` are substrate-neutral strict
  TypeScript: controllers, boards, decks, undo, drag and drop, targeting,
  placement, laps, steering, inventory and crafting, spatial hashing, the
  seeded rng, tweens, wave spawning, save slots.
- `canvas2d/` is the 2D substrate's own: Tiled JSON import, the tilemap
  painter, the 2D camera, sprite animation, parallax, particles, lighting,
  nine-slice, text and layer caches. Each takes the context or a `View`
  layer as a parameter and requires nothing but `typescript`.
- `three/`, `render/`, `effects/` and `compute/` are the 3D substrate's:
  animation graph, level loader, terrain chunks, cameras, vehicle, ambient
  occlusion; materials and passes; vgpu effects and compute.
- `physics/` (Rapier, 2D and 3D, deterministic build) and `nav/`
  (recast-navigation) are the two categories whose entries pin a **wasm
  package**. Their `requires` name that package at one exact version, and
  the project pins it exactly the same — never a caret range — because the
  registry proved the entry's determinism against that build and no other.
  Both step only inside `step(dt)` and are the only source for a physics
  world or a navmesh: a hand-integrated capsule or a home-grown A* over a
  mesh is fresh authorship the shelf already made unnecessary.

Use the substrate skill's recipe map as search leads, not a guarantee that an
entry exists. Inspect `registry_list` or `registry_search`, then `registry_get`
for the exact entry. Map each required graph system to the returned code and
its real consumer; vendor only what the accepted specification needs. A pillar
written from memory where a suitable entry exists skips the retrieval ladder.

## Vendor, don't depend

Adopting a registry entry means **copying its files into the project** under
`src/registry/<category>/<name>/` beside a `registry.provenance.json` the
project writes from the `registry_get` answer — `id`, `registry`
(`origin-examples`), `version` (the entry's content digest, served with it;
never invented), `requires` and the `files` list — and then owning the code
fully:

- The entry declares its pinned peer versions (`requires`) and, through
  them, its substrate: an entry that requires `three` cannot be vendored
  into a `canvas2d` project, and re-implementing its idea against the 2D
  context is fresh authorship, not vendoring. Confirm the peers match the
  project's before vendoring, and adapt the code — not the project's pins —
  when they differ. `check:deps` holds that line afterwards: every
  `requires` must equal the project's own pin, and a wasm package must be
  pinned exactly.
- The entry imports only its own files and the packages its `requires`
  names; `check:arch` fails an entry that reaches into a project module or
  imports a sibling entry. Two entries that need each other are composed in
  the project's own wiring file — the platformer controller takes the
  physics system as a `Mover`, the tilemap painter takes the imported map —
  never by one entry importing the other.
- Vendored code is project source from the moment it lands: the gates apply
  to it (`check:arch`, `typecheck`, `check:deps`, `check:smoke`, and on
  `three` `check:wgsl` for shader files), and it is edited freely afterward.
  Its constants are the entry's defaults, exempt from the tunable rule; the
  project binds them to `src/tuning.ts` in its own wiring file, which the
  rules cover in full. There is no update channel and no runtime fetch — a
  newer registry version is adopted by deliberate re-vendor, never silently.
- Everything below tier 1 on the ladder is *reference only*: read it in a
  scratch directory, never copy it into the project tree. The project's
  version is written fresh against the project's strict conventions.

## Vendoring is not integration

Use Bun 1.4.2 for dependency work. After changing a package, run
`bun run check:deps` for registry provenance and `bun run check:audit` for
registry-reported security advisories; they answer different questions.
Audit is network-dependent: an unavailable registry is not a clean audit.
For an upgrade, inspect package contents with explicit versions, for example
`bun pm diff --diff=vgpu@0.4.0 --diff=vgpu@0.4.1`; this compares published
packages, **not** two lockfile revisions. Inspect `git diff -- package.json
bun.lock` as well. Never run bare `bun pm diff` on the unpublished `game`
package: its default compares against the unrelated registry package name.
`bun audit fix --dry-run` can propose repairs; do not put automatic fixes in a
gate. Review any pin/provenance impact before applying an intentional upgrade,
regenerate the lock with the declared Bun, then run frozen install and all
affected gates. These scripts do not use `bun test`; retry/changed/parallel
test flags do not apply to the deterministic `check:smoke` journey.

Name the importing module and its owner before adopting an entry. Demonstrate
the actual assembly/registration and live behavior, including the relevant
journey transition. Files that are never imported or called are not delivered
systems. A large module inventory cannot certify progression beyond the path
actually played. Bind source digest, adapted version, consumer revision and
executed evidence through the graph's current verification contract.

## Distilling back

A mechanic that proved itself in a real project is worth contributing back
to the registry. Distillation is deliberate authorship, not an export:

- **Evidence first**: the code passed all project gates and shipped in a
  playable build. Hollow or speculative entries are not contributed.
- **Dependency-inject** the module: no imports from project internals, no
  global state; peers (three and vgpu on that substrate; a wasm package at
  its exact deterministic build under `physics/` or `nav/`; none on
  `canvas2d`, which takes the context as a parameter) declared with exact
  pins in the entry's `registry.json`; tunables surfaced as typed
  parameters and listed in `registry.json` with their defaults and ranges.
- Shape it as the registry expects: entry directory under its category with
  `registry.json` (id, title, description, tags, `requires`, `tunables`,
  file list in exact two-way closure, `source` attribution where the idea
  has one), source files, and a README stating what it does and its
  verified evidence.
- Publish a contribution only when the person explicitly asks, following that
  repository's current contribution instructions and verification. Do not
  introduce a PR or release workflow into this game's production. Nothing
  about this flows through the evaluation ledger;
  a recipe is code with evidence, a ledger entry is working knowledge, and
  neither substitutes for the other.
