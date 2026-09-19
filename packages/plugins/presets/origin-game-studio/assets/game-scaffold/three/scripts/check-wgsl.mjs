#!/usr/bin/env bun
// The WGSL gate: resolve every shader entry in src/shaders/.
// It resolves the module graph, parses, reflects, and — where a GPU device
// exists — compiles against real validation. Shared modules in subdirectories
// are judged through the entries that import them.
//
// Run it over this project, or over another tree:
// `bun scripts/check-wgsl.mjs [root]`.

import { readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { resolveShader } from "@vgpu/wgsl/runtime";
import { tslExports } from "vgpu/three";

const root = resolve(process.argv[2] ?? ".");
const shaders = join(root, "src", "shaders");

let entries = [];
try {
  entries = readdirSync(shaders, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".wgsl"))
    .map((entry) => join(shaders, entry.name))
    .sort();
} catch {
  // No src/shaders/ yet: a project with no shaders has nothing to fail.
}

if (entries.length === 0) {
  process.stdout.write("check:wgsl found no shader entries under src/shaders/.\n");
  process.exit(0);
}

let failed = 0;
for (const entry of entries) {
  try {
    // Keep the CLI's Node/Dawn software-renderer discovery and re-exec path.
    // Loading Dawn directly under Bun does not provide that CLI setup.
    const check = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["vgpu", "check", entry, ...(process.env.VGPU_VALIDATE === "require" ? ["--require-validation"] : [])],
      { cwd: root, stdio: "inherit" },
    );
    if (check.status !== 0) throw new Error("vgpu check failed");
    const resolved = await resolveShader({ entry, validate: "off" });
    // A root without stages is a Three-facing pure helper module. Use the
    // resolver's metadata and the adapter itself, never regex export parsing.
    if (resolved.reflection.entryPoints.length === 0) {
      if (resolved.functionExports.length === 0) {
        throw new Error("helper module has no direct export fn declarations");
      }
      tslExports(resolved)(...resolved.functionExports.map(({ name }) => name));
    }
    process.stdout.write(`${basename(entry)}: ${resolved.functionExports.length} function export(s).\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`check:wgsl failed on ${basename(entry)}: ${error instanceof Error ? error.message : error}\n`);
  }
}

if (failed > 0) {
  process.stderr.write(`\ncheck:wgsl found ${failed} failing entr(y|ies) of ${entries.length}.\n`);
  process.exit(1);
}

process.stdout.write(`check:wgsl passed over ${entries.length} entr(y|ies).\n`);
