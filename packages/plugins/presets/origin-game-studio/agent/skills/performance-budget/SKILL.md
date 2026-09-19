---
name: performance-budget
description: Client performance budgets, quality tiers, asset lifetime and frame-time verification for games.
---

Performance is a product constraint, not a cleanup pass. Set its budgets in
`src/tuning.ts`, exercise them on the shipping view, and verify them with the
same reproducible inputs as gameplay plus real-time resource measurements.
A game that is smooth only on the machine that built it has not passed.

## Count the resource the client pays for

For textures, budget **decoded GPU memory**, never download size. A compressed
file can be tiny on the wire and enormous after decode: estimate each mip
chain from its dimensions and GPU format, include every simultaneously live
texture, and measure the live total where the renderer permits it. Download
weight remains a loading metric; it is not a rendering-memory metric.

On `canvas2d` the same rule holds for decoded bitmaps and for every
`OffscreenCanvas` layer cache the scene owns: a cache is a full-resolution
surface at the device-pixel-ratio, and four of them at a phone's ratio are
more memory than the sprite sheets they were built from.

Load level-owned assets on entry and release them on leave. Disposing a
material is not enough when its textures, render targets or cached loaders
still retain GPU resources; dropping a scene is not enough when its layer
caches still hold their surfaces. Return to the same level during
verification: a second entry whose live memory only grows is a leak.

## Start conservative and judge the GPU

Default to a conservative device-pixel-ratio cap and conservative antialiasing.
Do not infer a strong graphics device from CPU core count or system RAM; those
signals say nothing reliable about the GPU. Promote quality only from observed
render performance, and step it down when the measured budget is missed.

## Quality is one coordinated system

Define explicit quality tiers in `src/tuning.ts`. A tier controls the settings
that spend the frame together:

- resolution multiplier and device-pixel-ratio cap;
- antialiasing and expensive post-processing;
- particle and simultaneous-unit ceilings;
- animation update rate; and
- frame-rate cap.

Keep an instant switch to the lowest tier. If frame time immediately recovers,
the bottleneck is in the render-quality budget; if it does not, investigate
simulation, allocation and asset churn instead. The low switch is a diagnostic
instrument as well as a user setting — it must not require a restart or level
reload.

Particle, simultaneous-unit and draw-call ceilings are tunable parameters,
not numbers hidden in emitters, spawners or scene assembly. Systems may spend
up to those budgets and must degrade deliberately when they reach them rather
than growing without bound.

On `canvas2d` the draw-call budget is the count of context operations per
frame — every `drawImage`, path fill, stroke and state change — and the
instant low switch is a layer cache: the lowest tier blits cached background
and parallax surfaces and drops per-sprite composite modes and shadows. If
frame time recovers under that switch the context is the bottleneck, and the
`canvas2d-substrate` skill's GPU upgrade rule applies; if it does not, the
cost is in simulation or allocation and no renderer change will find it.

## Verify frame time, not feel

Use a stored playtest script to reproduce the intended worst shipping view.
Deterministic advance locates the state; actual frame-time claims require
real elapsed-time sampling at the declared device/throttled profile, not the
injected clock's simulated duration. Assert telemetry for frame time and the
declared particle, unit, draw-call and decoded-texture-memory budgets. Record
warm-up separately and assert the steady interval; shader compilation or
loading spikes must not be averaged away into a plausible number.

Developer-machine feel is useful for finding a problem and is never the pass
condition. A performance claim needs the profile, the scene and input script,
the sampled interval, the percentile or maximum being asserted, and the
budget from `src/tuning.ts` that it passed.

## Startup peak and packaged runtime

No leak does not mean a safe peak. Measure cold launch through first playable
frame, asset decode/upload overlap, shader compilation and level transition
separately from steady play and repeated-entry leak checks. Include CPU heap,
decoded images/audio, GPU resources and temporary copies where observable.
Bound simultaneous loads and release intermediates rather than relying on a
later garbage collection to rescue startup. State unobservable totals as
unknown, not zero or safely below budget.

Exercise the exact delivery package at the intended phone/desktop sizes and
quality tiers. A development server cannot certify the protected Worker:
its asset routing, MIME/headers, authorization boundary, compression and
startup environment may differ. Record package/source identity, environment,
launch path, cold versus warm cache, peak and steady samples, budget and
failure symptoms. If that environment is unavailable, leave its Delivery
criterion unverified instead of promoting a development measurement.
