---
name: playtest-instruments
description: Deterministic replay practice — input scripts, advance, capture, telemetry assertions and comparisons.
---

Deterministic replay is the focused regression instrument. Natural journey,
real-time performance and audio checks prove different claims; none replaces
the others. Read the graph's journey matrix before selecting coverage.

## First interaction is an early, narrow claim

Before art and later systems, launch the `greybox` milestone and invite the
person to try its real controls. Use a stored script that moves the player or
manipulates a piece, not an empty script or a menu-only click. Observe probe
ticks before and after: the script must dispatch input without refusals and
the simulation must advance. Inspect a frame showing the actual play area.
Record only that first interaction; it does not prove game feel, visual
quality, full progression or delivery. If the Stage or probe is unavailable,
report the blocker rather than claiming a build command proved playability.

## The loop

1. **A stored input script** under `playtests/`, tick-ordered. Write the
   script to a file before running it: a script that exists only as a tool
   argument cannot be replayed by the next milestone, and replay is the whole
   point.
2. **Advance** against the injected clock rather than waiting on wall time.
   Wall-clock waiting produces a different world on a loaded machine.
3. **Capture** the frames the assertion needs, at named ticks.
4. **Assert on telemetry**, not on the capture.
5. **Submit the comparison** with its measured facts when the run is claiming
   an improvement.
6. **Verify the milestone** only after every required replay, assertion,
   comparison and generated workflow gate has settled. Call `verify_milestone`
   once for that settled decision, following its descriptor; an ordinary
   checkpoint is not this decision. What the milestone must end with is one
   current decision, not one call ever made — a decision that proves premature
   is corrected by recording the corrected one, which supersedes it.

Every script under `playtests/` is a regression asset. Later milestones replay
them against their still-applicable criteria. An intentional design change
may require a documented script update; never rewrite an assertion merely
because the implementation fails it.

## Natural journeys and exact delivery

Exercise each required journey from normal launch and its legitimate prior
state. Cover progression through every promised area, level boundary and
ending, plus failure/retry, pause/return and save/resume where applicable.
Use the actual supported input modes, including touch and controller where
promised. Name what was reached and what remains unplayed.

`goto`, teleport, direct state injection and destination-only screenshots are
diagnostic shortcuts, not evidence that an exit or prerequisite works. A
broken transition stays broken even when its destination runs. Focused replay
of an early progression segment cannot certify the rest of the campaign.

Bind input scripts, command/tool outputs, observed results, captures and
telemetry to the source/export/consumer revisions and exact build. Record
Journey and Delivery evidence through the current tool schema, without
inventing a graph verdict or lifecycle. Repeat relevant paths on the exact
shipping package; development-server results do not certify that artifact.

## The golden gate

Rendering regression is a number before it is a look. At a moment worth
keeping — a named tick reached by script and advance — `record_golden` under
a stable name. On every later pass, walk the page to the same tick and
`check_golden`: the answer is a differing-pixel ratio against the bound, with
both ticks printed so a check taken at the wrong moment reads as a mismatch,
not as a rendering change.

A failed check stores a heatmap artifact saying **where** the pixels moved.
Read the number and the heatmap first; spend `read_stage_frame` — one frame
with the probe state beside it — only when the number cannot say whether the
change is the intended one. A golden check never answers taste; that stays
with the image gates in `visual-acceptance`.

When a change is intentional, re-record the golden in the same change and say
so in the comparison note. A baseline nobody re-records rots into a gate
everyone overrides.

## Judge from the view that ships

Judge the vehicle from the chase camera. Judge a character from a
player-scale turntable. Do not judge from a scenery station — an orbit camera
parked at a scenic angle answers a question nobody playing the game will ever
ask, and it flatters exactly the mistakes the shipping view exposes.

## What determinism costs, and what it buys

A seeded RNG and a fixed step mean a stored script replays to the same world.
That is what lets you say "this changed and nothing else did". Any source of
nondeterminism — wall-clock time, unseeded randomness, a value written during
render, a frame-rate-dependent update — silently converts every later
comparison into a guess.

Live keys pressed by a person are not a deterministic replay. Record observed
live behavior honestly, then reproduce a discovered defect with a stored
script where possible. Keep real-time input, sound and performance evidence
distinct from claims that require identical seeded replay.

## Honest instruments

If the probe does not implement a member, say so rather than working around
it. "This project does not support picking" is a true answer; a nearest-guess
raycast that reports a wrong entity is worse than no answer, because the
person will direct the next change at the thing you named.
