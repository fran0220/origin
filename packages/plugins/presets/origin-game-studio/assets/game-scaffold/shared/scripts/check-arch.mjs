#!/usr/bin/env bun
// The architecture gate. It is a road sign: every rule it enforces has a
// stated way through it that is smaller than the thing it stopped.
//
// Run it over this project, or over another tree: `bun scripts/check-arch.mjs [root]`.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const LINE_CEILING = 400;

// Counting, indices and halving are structure, not tuning. Everything else a
// person could want to feel differently belongs in src/tuning.ts.
const STRUCTURAL_NUMBERS = new Set(["0", "1", "2", "-1"]);

// The instrument layer is consumed, not tuned, and it owns real constants.
// A vendored registry entry owns its defaults the same way: the project binds
// them to src/tuning.ts in its own wiring file, which the rules cover in full.
const UNTUNED = ["src/core/", "src/tuning.ts", "src/registry/"];

// Vendored code is judged by its provenance, not by the authored-code rules:
// the line ceiling and the tunable rule stop at its door, the import rules
// tighten (it reaches only itself and the packages its provenance names).
const VENDORED = "src/registry/";
const PROVENANCE = "registry.provenance.json";

// The entity layer's own contract files: they describe entities rather than
// being entities, so the registry does not name them.
const ENTITY_CONTRACT = ["src/entities/entity.ts", "src/entities/registry.ts"];

const root = resolve(process.argv[2] ?? ".");
const source = join(root, "src");
const violations = [];

/**
 * Comments out, string contents kept.
 *
 * The tunable rules read what a literal says, so they cannot use `strip`,
 * which blanks every string on purpose so that prose never counts as code.
 */
function withoutComments(text) {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const two = text.slice(index, index + 2);
    if (two === "//") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (two === "/*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }
    const quote = text[index];
    if (quote === '"' || quote === "'" || quote === "`") {
      let end = index + 1;
      while (end < text.length) {
        if (text[end] === "\\") {
          end += 2;
          continue;
        }
        if (text[end] === quote) {
          end += 1;
          break;
        }
        end += 1;
      }
      out += text.slice(index, end);
      index = end;
      continue;
    }
    out += text[index];
    index += 1;
  }
  return out;
}

/**
 * Every dotted path `src/tuning.ts` really holds.
 *
 * A published parameter naming a path the table does not have is a dial that
 * reads `undefined` and writes nowhere — which the person only discovers by
 * dragging it. Scanning the object's keys is enough: the paths are literal,
 * and a table built at runtime would already have broken parameter
 * univocality.
 */
function tunablePaths(text) {
  const code = withoutComments(text);
  const paths = new Set();
  const trail = [];
  let index = 0;
  let word = null;
  while (index < code.length) {
    const character = code[index];
    const key = /^["']?([A-Za-z_$][\w$]*)["']?\s*:/.exec(code.slice(index));
    if (key !== null) {
      word = key[1];
      paths.add([...trail, word].join("."));
      index += key[0].length;
      continue;
    }
    if (character === "{") {
      trail.push(word ?? "");
      word = null;
    } else if (character === "}") {
      trail.pop();
      word = null;
    }
    index += 1;
  }
  // The outermost `export const tuning = {` contributes one empty level.
  return new Set([...paths].map((path) => path.replace(/^\.+/, "")));
}

/** Each `path: "..."` a file declares as a published tunable. */
function declaredTunablePaths(text) {
  const found = [];
  const pattern = /\bpath\s*:\s*(["'])([^"'\n]+)\1/g;
  let match;
  while ((match = pattern.exec(withoutComments(text))) !== null) {
    found.push(match[2]);
  }
  return found;
}

function fail(file, message) {
  violations.push(`${file}: ${message}`);
}

function walk(directory) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(full);
    }
  }
  return found;
}

/** Every file, whatever its extension — the shader-home rule judges them all. */
function walkEverything(directory) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkEverything(full));
    } else if (entry.isFile()) {
      found.push(full);
    }
  }
  return found;
}

/** Comments and literal text are prose; only code is judged. */
function strip(text) {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const two = text.slice(index, index + 2);
    if (two === "//") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
      continue;
    }
    if (two === "/*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
      continue;
    }
    const quote = text[index];
    if (quote === '"' || quote === "'" || quote === "`") {
      index += 1;
      while (index < text.length) {
        if (text[index] === "\\") {
          index += 2;
          continue;
        }
        if (text[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      out += '""';
      continue;
    }
    out += text[index];
    index += 1;
  }
  return out;
}

function importsOf(text) {
  const found = [];
  const pattern = /(?:from|import)\s*\(?\s*(["'])([^"'\n]+)\1/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    found.push(match[2]);
  }
  return found;
}

/** A relative specifier as the tree holds it: `./loop.js` is `loop.ts`. */
function resolveImport(file, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const target = resolve(dirname(file), specifier);
  return target.endsWith(".js") ? `${target.slice(0, -3)}.ts` : target;
}

function within(path, prefix) {
  const full = join(root, prefix.split("/").join(sep));
  return path === full || path.startsWith(full.endsWith(sep) ? full : `${full}${sep}`);
}

/** The package a bare specifier names: `three/webgpu` is `three`, `@vgpu/wgsl/x` is `@vgpu/wgsl`. */
function packageOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/**
 * The vendored entries under src/registry/, keyed by their directory.
 *
 * An entry is `src/registry/<category>/<name>/` holding a provenance file
 * whose `id` is `<category>/<name>`. Every TypeScript file under the vendored
 * root must belong to exactly one entry; a stray file there is authored code
 * pretending to be vendored, and the gate names it.
 */
function vendoredEntries() {
  const entries = new Map();
  const vendored = join(root, VENDORED.split("/").join(sep));
  let categories;
  try {
    categories = readdirSync(vendored, { withFileTypes: true });
  } catch {
    return entries;
  }
  for (const category of categories) {
    if (!category.isDirectory()) {
      fail(relative(root, join(vendored, category.name)), "sits at the vendored root; an entry is src/registry/<category>/<name>/");
      continue;
    }
    for (const name of readdirSync(join(vendored, category.name), { withFileTypes: true })) {
      const directory = join(vendored, category.name, name.name);
      const label = relative(root, directory).split(sep).join("/");
      if (!name.isDirectory()) {
        fail(label, "sits beside entries; an entry is src/registry/<category>/<name>/");
        continue;
      }
      const id = `${category.name}/${name.name}`;
      let provenance;
      try {
        provenance = JSON.parse(readFileSync(join(directory, PROVENANCE), "utf8"));
      } catch {
        fail(label, `has no readable ${PROVENANCE}; vendored code carries its provenance or it is authored code in the wrong home`);
        continue;
      }
      if (provenance.id !== id) {
        fail(label, `${PROVENANCE} names ${provenance.id ?? "no id"}, but the directory is ${id}`);
      }
      if (typeof provenance.registry !== "string" || typeof provenance.version !== "string") {
        fail(label, `${PROVENANCE} must name the registry it came from and the version it was vendored at`);
      }
      const requires = provenance.requires;
      if (requires === null || typeof requires !== "object") {
        fail(label, `${PROVENANCE} must carry the \`requires\` the registry verified the entry against`);
      }
      const present = new Set(
        walkEverything(directory).map((file) => relative(directory, file).split(sep).join("/")),
      );
      for (const listed of Array.isArray(provenance.files) ? provenance.files : []) {
        if (!present.has(listed)) {
          fail(label, `${PROVENANCE} lists ${listed}, which is not in the entry`);
        }
      }
      entries.set(directory, { id, requires: new Set(Object.keys(requires ?? {})) });
    }
  }
  return entries;
}

/** The entry a vendored file belongs to, or `null` for a stray. */
function entryOf(file, entries) {
  for (const [directory, entry] of entries) {
    if (file.startsWith(`${directory}${sep}`)) {
      return { directory, ...entry };
    }
  }
  return null;
}

const files = walk(source).sort();
const main = join(source, "main.ts");
const registry = join(source, "entities", "registry.ts");
const registered = new Set(
  (files.includes(registry) ? importsOf(readFileSync(registry, "utf8")) : [])
    .map((specifier) => resolveImport(registry, specifier))
    .filter((path) => path !== null),
);
const tuningFile = join(source, "tuning.ts");
const declaredTable = files.includes(tuningFile)
  ? tunablePaths(readFileSync(tuningFile, "utf8"))
  : new Set();
const vendored = vendoredEntries();

for (const file of files) {
  const name = relative(root, file).split(sep).join("/");
  const text = readFileSync(file, "utf8");
  const code = strip(text);

  if (within(file, VENDORED)) {
    const entry = entryOf(file, vendored);
    if (entry === null) {
      fail(name, "is under src/registry/ but inside no entry; authored code lives in the layer it belongs to");
      continue;
    }
    for (const specifier of importsOf(text)) {
      const target = resolveImport(file, specifier);
      if (target === null) {
        if (!entry.requires.has(packageOf(specifier))) {
          fail(name, `imports ${specifier}, which ${entry.id}'s provenance does not name in \`requires\``);
        }
      } else if (!target.startsWith(`${entry.directory}${sep}`)) {
        fail(name, `imports ${specifier}: a vendored entry reaches only its own files, never the project's`);
      }
    }
    continue;
  }

  const lines = text.split("\n").length;
  if (lines > LINE_CEILING) {
    fail(name, `${lines} lines, over the ${LINE_CEILING}-line ceiling — split it along its seams`);
  }

  for (const specifier of importsOf(text)) {
    const target = resolveImport(file, specifier);
    if (target === null) {
      continue;
    }
    if (target === main) {
      fail(name, "imports src/main.ts, which is the entry point and nothing else's dependency");
    }
    if (within(file, "src/entities/") && within(target, "src/scenes/")) {
      fail(name, `imports ${specifier}: an entity never reaches into a scene`);
    }
    if (within(file, "src/core/") && !within(target, "src/core/")) {
      fail(name, `imports ${specifier}: the instrument layer is imported, never an importer`);
    }
  }

  if (file === main) {
    for (const [token, why] of [
      ["class ", "declares a class"],
      ["function ", "declares a function"],
      ["=>", "declares a closure"],
      ["if (", "branches"],
      ["for (", "loops"],
      ["while (", "loops"],
    ]) {
      if (code.includes(token)) {
        fail(name, `${why}; main.ts assembles the parts and nothing more`);
      }
    }
  }

  if (
    within(file, "src/entities/") &&
    !ENTITY_CONTRACT.some((contract) => within(file, contract)) &&
    !registered.has(file)
  ) {
    fail(name, "is not registered in src/entities/registry.ts");
  }

  for (const declared of declaredTunablePaths(text)) {
    if (!declaredTable.has(declared)) {
      fail(
        name,
        `publishes the tunable ${declared}, which src/tuning.ts does not hold — a dial over it reads nothing and writes nowhere`,
      );
    }
  }

  if (!UNTUNED.some((exempt) => within(file, exempt))) {
    const numbers = new Set();
    const pattern = /(?<![\w.$])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi;
    let match;
    while ((match = pattern.exec(code)) !== null) {
      if (!STRUCTURAL_NUMBERS.has(match[0])) {
        numbers.add(match[0]);
      }
    }
    for (const number of [...numbers].sort()) {
      fail(name, `holds the tunable number ${number}; every tunable lives in src/tuning.ts`);
    }
  }

  // WGSL travels as .wgsl modules under src/shaders/, where `bun run
  // check:wgsl` validates it and the build emits the resolved artifact the
  // native target consumes. A shader inline in a string is invisible to both.
  if (/@(?:vertex|fragment|compute)\b/.test(withoutComments(text))) {
    fail(name, "holds inline WGSL; shader source lives in src/shaders/*.wgsl");
  }
}

// src/shaders/ is the one shader home: entries at its root, shared modules in
// subdirectories, all of it .wgsl the gates can see. Code that wants to exist
// there belongs in a system or in src/core/.
for (const file of walkEverything(join(source, "shaders"))) {
  const name = relative(root, file).split(sep).join("/");
  if (!file.endsWith(".wgsl") && !file.endsWith(".md")) {
    fail(name, "is not WGSL; src/shaders/ holds only .wgsl modules");
  }
}

if (violations.length > 0) {
  for (const violation of violations.sort()) {
    process.stderr.write(`${violation}\n`);
  }
  process.stderr.write(`\ncheck:arch found ${violations.length} violation(s).\n`);
  process.exit(1);
}

process.stdout.write(`check:arch passed over ${files.length} file(s).\n`);
