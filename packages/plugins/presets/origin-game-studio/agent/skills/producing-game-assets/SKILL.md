---
name: producing-game-assets
description: Produces 2D, 3D, animation, audio and UI assets through a source-to-runtime pilot before batch work. Use for asset planning, generation, rigging, export or integration.
---

Produce assets for their actual consumers. The compiled Game instructions own
the production order; the graph owns the specification. Read the node, its
dependencies and the current tool descriptors, then use `prepare_production`
for its resolved brief. Do not create a second asset specification in this
skill or in a worker's scratch notes.

The first `greybox` milestone comes before this asset pipeline. It uses plain
shapes so the person can already move/play while content is made. Do not
require every direction, layout or individual reference image before launching
that build. This changes production order, not final scope or fidelity: after
the first playable, produce the accepted references and route samples before
their consumers and batches. Tell the person what becomes visible next, not
how many generation jobs are running.

## Resolve the route and inputs

Read `read_design_schema` and `read_production_brief` when preparing work.
Use the node's declared route and explicit dependency-node/reference inputs,
not a universal provider recipe. A generated character, hand-authored UI,
imported environment and procedural effect need different proofs. If the
person specified Meshy, do not replace it with primitives or make it optional;
explain a real availability/fidelity problem and return that product choice
for revision. Routine technical cleanup needs no human approval.

Discover the mounted services. Use `origin-assets` for binary library assets:
`assets_search_3d` for models, the image/audio/HDR/font searches for those
media, then inspect details, files and the fetch plan. Follow the returned
descriptor and attribution terms. `origin-examples` is code; game knowledge
is research; neither is a model catalog. A selected but unavailable service
is not evidence that its catalog was searched.

For generated work use shared Generate, never a second external Generate MCP
or direct provider credentials. Use `generate_models` to discover the current
models, connection IDs and supported endpoint types; availability is not
quota or membership entitlement. For still images call `generate_image` and
`edit_image` without `model`: the configured default image model
(`default_image_model` in that listing) is applied, and a model is named only
when the person or the Project named it. Read `generate_3d` before submitting
work.
Retain the caller's `operation_id`, exact inputs and selected connection/model
before create. Unknown acknowledgement is provider-specific: Hunyuan recovery
uses the same operation ID, exact input and connection through its durable
outbox. For uncertain Meshy admission, retain that identity but do not
resubmit, even with the same key; resolve whether the provider task exists
first. Meshy's failed admission acknowledgement does not guarantee duplicate
suppression. Never replace an uncertain request with a fresh paid create.

The returned `task_id` is an opaque connection-and-API-bound handle. Preserve
it unchanged for polling, completed GLB download and predecessor inputs to
Meshy operations; never extract a provider ID or switch its connection.
A bounded wait ending is not job failure: resume the same task. Polling may
be status-only; download completed GLB output promptly rather than hotlinking
it. Keep original references, source outputs and editable intermediates even
when an export fails.

## Separate the reference roles

- Direction boards settle palette, shape language, atmosphere and materials.
- Play-camera layouts settle scale, composition, navigation and UI occupancy.
- Individual references describe the particular character, prop, surface or
  screen that a producer must make, with consistent views and useful framing.

A master concept never substitutes for the individual inputs required by
the plan. Do not send a collage of unrelated figures as one model reference.
Identify the subject, clean up framing and preserve proportions; mark unseen
geometry as inference instead of pretending the image specifies it. Store
references locally and connect them to the graph using tool-owned path rules.

When revising an existing image, use shared `edit_image` with the workspace
image and optional PNG mask following its descriptor, retaining the source.
Select the model and connection explicitly as with other shared media tools.
An edit failure is not permission to fall back to generating a replacement
that discards the original image's constraints.

## Prove 3D from source through engine

1. Resolve units, axes, origin/pivot, bounding dimensions, silhouette, topology,
   material roles, texture budget, rig expectations, collision and export
   format with the consuming module owner. Use the play camera as the visual
   criterion; add diagnostic angles for hidden defects.
2. Choose the advertised production operation that matches the work. Hunyuan
   shape isolates geometry; one-click produces textured geometry; texture-only
   paints the supplied geometry instead of generating a replacement shape.
   Use the discovered model and operation pairing in the descriptor. Supply
   its accepted local image or image data input, never assume an HTTPS image
   URL is allowed. Prepare the texture input as the descriptor's plain,
   identity-transform GLB with its exact file digest, topology and size limits;
   retain the original source separately. Repair shape locally and preserve
   oriented triangles when texturing; a failed texture pass is not a reason
   to start a new shape job. Meshy's advertised operations are `text_preview`,
   `text_refine`, `image`, `remesh`, `rig` and `animate`; use their required
   predecessor handles. Do not invent a texturing or animation-action catalog
   operation, or assume providers share formats and task identities.
3. Download and inspect the real mesh/material output. Open it in Blender
   when cleanup, rigging or export requires it; retain the editable source.
   Check topology, UVs, normals, material slots, scale, transforms and pivot.
   Technical validity alone does not establish the requested likeness.
4. For a character, verify skeleton identity, hierarchy, bind pose, skin
   weights and joint deformation before batch animation. Import a
   representative clip and exercise locomotion, transitions and any root
   motion in the game. Clip count is not skeleton compatibility.
5. Export through the actual shipping format and importer. In-engine inspect
   texture/color-space roles, lighting, silhouette, scale, clipping, collision
   and motion. Identify the exact source and export revisions in the evidence.
6. If export or import fails, diagnose the failing stage and reuse the source
   when valid. Do not regenerate a good source to conceal a broken converter.
   Batch only the route this end-to-end sample proves, then sample outliers
   and recheck every changed shared rig, material or export contract.

## Prove 2D as moving, colliding content

Set sprite dimensions at actual play scale, pivot, facing, padding, alpha,
atlas slicing, frame timing and collision independently of the artwork.
Inspect transparency fringes, sheet consistency and pixel-art sampling in
the loaded runtime, not just an image viewer. Play the animation through its
state transitions; test different facing, movement and contact states. A
good still cannot prove foot placement, attack timing or readable motion.
Keep editable art and packing settings so atlas changes remain reproducible.

## UI artwork is not UI layout

Build the real menu/HUD/dialogue flow in the UI owner. Generated panels,
icons and nine-slice art are inputs, not screenshots of a finished screen.
Readable text remains real layout text. Exercise populated, empty, disabled,
error, pause and result states as applicable. At target phone and desktop
sizes verify reflow, safe areas, text clipping, touch target reach and whether
controls obscure the action. Check keyboard focus, pointer/touch cancellation
and any promised controller navigation. Evidence must name viewport, input
mode and the actual state shown.

## Sound is a runtime behavior

Specify music, ambience, UI cues and gameplay events with loop boundaries,
duration, level, concurrent voice budget and ownership. Import the actual
files, unlock audio through the normal player gesture, and listen to the mix
in a representative scene. Exercise mute/volume, pause/resume, transitions
and repeated events; check clipping, gaps, duplicate loops and unreleased
voices. A generation URL or waveform is not evidence that the game sounds
right. Avoid judging audio timing from accelerated deterministic advance.

## Handoff that a consumer can use

Return graph/node and reference identities, original sources and licenses,
task IDs, editable source and export paths/revisions, importer settings,
runtime consumer owner and exact wiring point, executed commands and outputs,
inspected captures or listened-to samples, and remaining defects. Attach
verification through the current graph/tool contract, binding the evaluation
and subject revisions rather than writing a success label. A producer's
handoff ends only when the integration owner can use those artifacts without
reconstructing the production history from a summary.
