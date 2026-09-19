---
name: visual-acceptance
description: Evaluates game visuals against direction, individual references and actual play-camera layouts. Use for visual critique, integration review or evidence-backed comparisons.
---

Judge the executed image against the graph's criterion and referenced inputs.
Technical render correctness, likeness and playable composition are different
claims. No fixed number of clean reviews promotes a system; record concrete
evidence and unresolved defects against the exact revision.

## Numeric and regression truth

Use telemetry for positions, velocities, timings, budgets and events. Check
agreement between physics, visuals, camera framing and UI rather than asking
whether each system's independent values look plausible.

For a rendering regression, use `check_golden` against a named baseline at
the same scripted tick, viewport and camera. Read its ratio and heatmap.
A golden diff detects change, not taste; inspect actual frames for art claims
even when the numeric check passes. Re-record an intentional baseline change
explicitly and preserve the reason, not to conceal an unexplained mismatch.

## Individual and whole-frame judgment

Compare the individual asset against its own references: silhouette and
interior landmarks, proportions, color/material regions, detail, deformation
and motion. A direction board alone cannot specify a hero model.

Then inspect it in the actual game camera and lighting at play scale. Compare
the whole frame with the chosen direction and play-camera layout: massing,
palette, atmosphere, ground cover, navigation readability, threats, interaction
prompts and HUD occupancy. A scenic angle cannot certify a chase-camera view.
A local improvement that harms the whole frame fails its consumer criterion.

Inspect target phone/desktop viewports and affected non-default states,
including motion and transitions where the change affects them. UI artwork
does not establish text layout, touch reach or actual screen behavior. Match
camera, scale and conditions when comparing revisions; state unavoidable
differences rather than treating unrelated pictures as before/after proof.

## Defect-driven iteration and evidence

When direction is wrong, settle it before more local polish. When a model or
layout is wrong, identify the failing criterion and fix the responsible stage.
Do not inflate asset counts, repeat a fixed number of reviews or soften the
criterion to obtain a pass. Use independent critique for a concrete uncertain
claim, then reproduce the finding in the executed result.

Record the source/reference versions, subject source/export/consumer revision,
camera/viewport/tick, tool outputs and inspected capture paths. Use the graph's
verification references according to the current descriptor: the evaluation
identity and frozen input fingerprint must identify the real evidence, and
the subject revision must identify what it examined. A later edit makes the
affected conclusion stale, not retroactively successful.

Keep refuted attempts and measured comparisons in the existing evidence
records and `docs/experiments.md`. Unknown measurements remain unknown;
differences inside measurement noise are not improvements. Checkpoints retain
the work by default; neither a checkpoint nor an image review is a mandatory
human technical approval or a substitute for natural journey verification.
