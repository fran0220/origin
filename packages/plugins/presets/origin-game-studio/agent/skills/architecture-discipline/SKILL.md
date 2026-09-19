---
name: architecture-discipline
description: When and where to split, what belongs in which layer, and why the architecture gate is a road sign.
---

Two failure modes govern a long run's codebase, both observed in practice.
A scaffold with example content invites filling in blanks instead of building
systems. A scaffold with no shape invites everything into one file. The answer
to both is shape without implementation — which is what the gate enforces.

## The layers

- `src/core/` — the instrument layer: the fixed-step loop, the probe, the
  seeded RNG, the asset loader. **Imported, never edited.** These are the
  instruments the stage and every assertion stand on.
- `src/scenes/` — the scene state machine: boot, title, play, pause, results.
- `src/entities/` — the entity registry and the type contract. Every entity is
  registered; an unregistered entity cannot be picked, addressed or tuned.
- `src/systems/` — one seam each: input, camera, audio, save, fx.
- `src/ui/` — the HUD layer, separate from scenes. A HUD that lives inside a
  scene cannot survive a scene transition, and that is discovered late.
- `src/tuning.ts` — the single home of every tunable parameter.
- `src/main.ts` — assembly only. No game logic, ever.

Entities never import scenes. Nothing imports `main.ts`. A dependency that
wants to run the other way is telling you the logic is in the wrong layer;
move the logic rather than the import.

## When and where to split

At 400 lines, split — the gate stops the file at 401, and it is a road sign,
not an adversary. Do not raise the ceiling and do not add an exemption.

Split along the seam the file already has: a file that grew a second
responsibility usually shows it as a cluster of functions that share no state
with the rest. If no seam is visible, the file is one thing that is genuinely
large, which almost always means logic that belongs to a system has been
inlined into an entity, or a data table has been embedded in code. Move the
table to data and the logic to its system.

Splitting for the line count alone, into `foo-part-2.ts`, satisfies nothing
and costs the next reader the seam that used to be obvious. If that is the
only split available, the real problem is upstream.

## The first playable precedes later systems

Read the graph's ordered milestones. Implement the first `greybox` as real
input, a visible player/piece, a boot-to-play route and simple play geometry.
Keep the full game in the plan, but register only systems needed by this slice
in `src/systems/index.ts`. The scaffold does this initial selection; input is
always present because the probe dispatches through it. Later accepted seams
stay unimplemented and unregistered until their content milestone. Implement
and register each together, then re-run earlier playtests. An optional later
sound/save system must not block the first movement build.

Launch as soon as this slice builds. Prove actual probe input and advancing
ticks; show the person how to play before commissioning the art family or
implementing progression. Plain shapes are temporary visuals, not silent
system stubs and not a replacement for the commissioned final assets.

## Loud failure

An unimplemented seam throws at assembly with its own name —
`systems/audio is not implemented` — and never returns a silent no-op. You
cannot ship around a hole that detonates; you can only implement it. That is
the intent. Do not convert a throwing seam into a stub to get past a build.

Which seams exist is the accepted graph's decision; `docs/design/systems.md`
is its derived implementation guide, never a competing specification. A
design with no rooms has no rooms seam. Input always remains for actual
player control and probe playback. If a system is missing, that is
visible on the design graph, not discovered here.

## Tuning

Every tunable number lives in `src/tuning.ts`. A magic number inline in an
entity breaks the live tuning path: the parameter pill will show the tuning
value while the game obeys the inline one, and the person will be told a lie
about the game they are playing.
