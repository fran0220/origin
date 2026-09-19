#!/usr/bin/env bun
// The dependency gate for vendored code: every entry under src/registry/ was
// verified by the examples registry against the exact versions its
// provenance names in `requires`, and nothing else. A project pin that drifts
// from them is an entry running where it was never proven to run, and this
// gate names the pin rather than letting the difference surface as a runtime
// error in a shipped build.
//
// `bun scripts/check-deps.mjs [root]`.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const PROVENANCE = "registry.provenance.json";

const root = resolve(process.argv[2] ?? ".");
const vendored = join(root, "src", "registry");
const violations = [];

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
} catch (error) {
  process.stderr.write(`check:deps could not read package.json: ${error}\n`);
  process.exit(1);
}
const pins = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };

/** A pin as the registry writes it: exact, no range prefix. */
function exact(pin) {
  return pin.replace(/^[\^~=v]+/, "");
}

let categories;
try {
  categories = readdirSync(vendored, { withFileTypes: true }).filter((entry) => entry.isDirectory());
} catch {
  process.stdout.write("check:deps found nothing vendored under src/registry/.\n");
  process.exit(0);
}

let checked = 0;
for (const category of categories) {
  for (const name of readdirSync(join(vendored, category.name), { withFileTypes: true })) {
    if (!name.isDirectory()) {
      continue;
    }
    const directory = join(vendored, category.name, name.name);
    const label = relative(root, directory).split(sep).join("/");
    let provenance;
    try {
      provenance = JSON.parse(readFileSync(join(directory, PROVENANCE), "utf8"));
    } catch {
      violations.push(`${label}: has no readable ${PROVENANCE}`);
      continue;
    }
    checked += 1;
    for (const [pkg, required] of Object.entries(provenance.requires ?? {})) {
      const pinned = pins[pkg];
      if (pinned === undefined) {
        violations.push(`${label}: requires ${pkg}@${required}, which package.json does not pin`);
      } else if (exact(pinned) !== exact(required)) {
        violations.push(
          `${label}: was verified against ${pkg}@${required}, but package.json pins ${pinned}`,
        );
      }
    }
  }
}

if (violations.length > 0) {
  for (const violation of violations.sort()) {
    process.stderr.write(`${violation}\n`);
  }
  process.stderr.write(`\ncheck:deps found ${violations.length} violation(s).\n`);
  process.exit(1);
}

process.stdout.write(`check:deps confirmed ${checked} vendored entr(y|ies) against package.json.\n`);
