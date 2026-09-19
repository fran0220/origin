# src/shaders/

The one home for WGSL. Nothing ships in it by default; the shape is the
contract:

- **Entries live at this root.** Every `*.wgsl` file directly in this
  directory is a shader entry: `bun run check:wgsl` validates each one, and
  `bun run build` emits its resolved, plain WGSL into `dist/shaders/` — the
  interchange artifact the native renderer consumes byte-for-byte.
  A root may instead be a pure Three material helper module with `export fn`
  and no shader stages or resources. `check:wgsl` selects its surviving exports
  through `vgpu/three` to check adapter support; shared exports must be uniquely
  named. A helper is not a standalone fullscreen pass for `bun run still`.
- **Shared modules live in subdirectories** (for example `lib/`) and are
  reached from entries with vgpu's WGSL import syntax. They are validated
  through the entries that import them, not enumerated separately.
- **No inline WGSL in TypeScript.** `bun run check:arch` fails a `.ts` file
  holding `@vertex`/`@fragment`/`@compute` in a string, because a shader the
  gates cannot see is a shader that breaks silently on the native target.
- **Identifiers are load-bearing.** The native side reflects bindings, struct
  members and entry points by name from the resolved artifact, so nothing in
  the build minifies WGSL identifiers. (Module-level struct names are
  namespaced deterministically by the resolver; everything addressed by name
  — binding variables, members, entry points — keeps its name.)

The build also emits `<entry>.wgsl.json`: `{ version: 1, wgsl,
functionExports }`, preserving the resolver's authored `name`, `resolvedName`
and `parameterNames` without serializing the resolver's cache or AST. Three helpers use
`tslExports<Contract>(shader)("name")` from `core/effects.ts` with the complete
import, never only `shader.wgsl`. The Vite plugin and ambient import types come
from `vgpu/client`. Do not reconstruct metadata with a custom parser.
`check:wgsl` reports validation skips honestly; set `VGPU_VALIDATE=require`
when GPU validation is required (install with `npx vgpu install-software-renderer`).

TypeScript imports an entry as a module (`import shader from
"../shaders/name.wgsl"`) via the Vite WGSL loader, and hands it to the vgpu
context from `src/core/effects.ts` — the context that adopted the renderer's
device. Tunable values reach a shader through uniforms wired to
`src/tuning.ts`, never through constants edited into the WGSL.
