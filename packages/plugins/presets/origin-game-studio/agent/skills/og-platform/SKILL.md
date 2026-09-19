---
name: og-platform
description: Guarded OriginGame platform use — readiness, saves, rooms, catalog assets and deployment.
---

The OriginGame platform features are optional. The game must run correctly
when they are absent, because that is how it runs in the stage, in a local
build, and for a person who declined them.

## The guard

Reach the platform only through a guard: `window.OG ?? null`, checked once at
assembly and passed down as a nullable service. Never call into it from an
entity or a system directly, and never assume the object exists because the
last session had it.

Keep the guard even when the design declined the platform features. It costs
nothing, and it is what lets the same build deploy cleanly either way.

## Readiness

Loading is the platform's, not the game's. Do not draw a second loading
screen over the platform's own.

Call `ready()` on the first frame that **actually drew something** — not when
assets finished loading, not at the end of boot. Calling it early hands the
person a black screen with the platform's loader already dismissed, which
reads as a broken game.

## Saves

Keep a save under 256 KB. Treat the budget as real: a save that grows with
play time will cross it in someone's long session, not in your test.

Save state is data, never code, and never a serialized object graph that
depends on class shapes — those break on the next refactor and take the
person's progress with them. Write an explicit versioned record.

## Rooms

Respect the message budget. A room message per frame is not a design; it is
an outage waiting for a busy evening. Send state deltas at a fixed cadence,
and make the receiver tolerant of a missed message rather than assuming
ordered delivery.

## Catalog assets

Search the catalog before generating. Generation spends the person's quota,
and a purely procedural hero silhouette reads as a primitive next to authored
work. Download catalog assets into the project, reference them by relative
path, and keep their attribution metadata alongside them — an asset whose
attribution was lost cannot be shipped.

## Deployment

Deploying is always an explicitly requested act. It is never a milestone side
effect, never part of "finishing", and never the natural next step after a
green build. Ask, or wait to be asked.
