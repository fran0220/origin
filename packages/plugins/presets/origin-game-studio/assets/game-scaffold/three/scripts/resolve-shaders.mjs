#!/usr/bin/env bun
// The shader artifact: resolve every entry in src/shaders/ to plain WGSL in
// dist/shaders/. That output is the interchange contract with the native
// renderer — it reads only these files and never parses the import dialect.
//
// Identifiers are never minified here: the native side reflects bindings and
// struct fields by name, so a rename in the artifact is a break on the other
// target. Validation belongs to `bun run check:wgsl`, not to this emit.
//
// Run it over this project, or over another tree:
// `bun scripts/resolve-shaders.mjs [root]`.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { resolveShader } from "@vgpu/wgsl/runtime";

const root = resolve(process.argv[2] ?? ".");
const shaders = join(root, "src", "shaders");
const out = join(root, "dist", "shaders");

let entries = [];
try {
  entries = readdirSync(shaders, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".wgsl"))
    .map((entry) => join(shaders, entry.name))
    .sort();
} catch {
  // No src/shaders/ yet: nothing to resolve is a clean pass, not a failure.
}

rmSync(out, { recursive: true, force: true });

if (entries.length === 0) {
  process.stdout.write("resolve-shaders found no entries under src/shaders/.\n");
  process.exit(0);
}

mkdirSync(out, { recursive: true });

let failed = 0;
for (const entry of entries) {
  try {
    const resolved = await resolveShader({ entry, validate: "off" });
    writeFileSync(join(out, basename(entry)), resolved.wgsl);
    // Keep the loader's public function identity beside the native WGSL.
    // Do not serialize resolver paths/cache state or reconstruct exports.
    writeFileSync(join(out, `${basename(entry)}.json`), `${JSON.stringify({
      version: 1,
      wgsl: resolved.wgsl,
      functionExports: resolved.functionExports,
    }, null, 2)}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`resolve-shaders could not resolve ${basename(entry)}:\n`);
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\nresolve-shaders failed on ${failed} of ${entries.length} entr(y|ies).\n`);
  process.exit(1);
}

process.stdout.write(`resolve-shaders emitted ${entries.length} artifact(s) into dist/shaders/.\n`);
