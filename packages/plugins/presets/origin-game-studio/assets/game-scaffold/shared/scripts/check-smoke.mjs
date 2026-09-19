#!/usr/bin/env bun
// The stage smoke: assemble the game with no view, advance a fixed number of
// steps, and fail on the first uncaught exception. Then the determinism half:
// the same assembly from the same seed, advanced again in a fresh process,
// must read back the same state. A physics world stepping outside the loop, a
// `Math.random`, a wasm module with its own clock — each shows up here as two
// states from one seed, at the checkpoint, not in a replay that quietly proves
// nothing.
//
// It runs the simulation, not the page. The simulation is where determinism
// lives, and a smoke that needed a GPU could not run at every checkpoint.
// Each advance runs in its own process so module-level state (the entity
// registry, a seam's own cache) starts clean both times. The simulation is
// emitted under the project's own tsconfig (`tsconfig.smoke.json` only adds
// an output directory), so what compiles for the build compiles for the
// smoke — a vendored engine whose typings resolve one way and not another is
// a second answer to one question, not a gate.
//
// `bun scripts/check-smoke.mjs [root]`; `--advance <compiled>` is the inner run.

import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";

const TICKS = 240;

const advanceAt = process.argv.indexOf("--advance");
if (advanceAt !== -1) {
  await advance(process.argv[advanceAt + 1]);
} else {
  gate();
}

/** One fresh process: assemble headless, advance, print the state as JSON. */
async function advance(out) {
  let assemble;
  let scenes;
  let systems;
  let entities;
  let tuning;
  try {
    ({ assemble } = await import(pathToFileURL(join(out, "core", "assemble.js")).href));
    ({ scenes } = await import(pathToFileURL(join(out, "scenes", "index.js")).href));
    ({ systems } = await import(pathToFileURL(join(out, "systems", "index.js")).href));
    ({ entities } = await import(pathToFileURL(join(out, "entities", "registry.js")).href));
    ({ tuning } = await import(pathToFileURL(join(out, "tuning.js")).href));
  } catch (error) {
    process.stderr.write(`check:smoke could not load the simulation: ${error}\n`);
    process.exit(1);
  }

  let game;
  try {
    game = await assemble({ seed: tuning.seed, view: null, assets: null, scenes, systems, entities, tuning });
    game.advance(TICKS);
  } catch (error) {
    process.stderr.write(`check:smoke stopped after assembly or during ${TICKS} steps:\n`);
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(1);
  }

  // Timings are wall-clock and differ every run by nature; everything else in
  // the readback is the world, and the world must not.
  const { timings: _timings, ...world } = game.state();
  process.stdout.write(`${JSON.stringify(world)}\n`);
}

function gate() {
  const root = resolve(process.argv[2] ?? ".");
  const out = join(root, ".smoke");

  rmSync(out, { recursive: true, force: true });

  const compiled = spawnSync(process.execPath, ["x", "tsc", "-p", "tsconfig.smoke.json"], {
    cwd: root,
    stdio: "inherit",
  });
  if (compiled.status !== 0) {
    process.stderr.write("check:smoke could not compile the simulation.\n");
    process.exit(1);
  }

  const runs = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const run = spawnSync(process.execPath, [process.argv[1], "--advance", out], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
    if (run.status !== 0) {
      process.exit(run.status ?? 1);
    }
    runs.push(run.stdout.trim());
  }

  if (runs[0] !== runs[1]) {
    process.stderr.write(
      `check:smoke advanced ${TICKS} steps twice from seed and reached two different states.\n` +
        "Something steps outside the fixed loop or draws on a clock or randomness the seed does not own.\n",
    );
    process.stderr.write(`first:  ${runs[0]}\nsecond: ${runs[1]}\n`);
    process.exit(1);
  }

  process.stdout.write(
    `check:smoke advanced ${TICKS} steps with no uncaught exception, twice to the same state.\n`,
  );
}
