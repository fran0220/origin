// The one bundler configuration. Rolldown serves and builds the same graph;
// bundled development removes the browser's module-request waterfall as a
// game grows. The unbundled mode remains a named diagnostic path while Vite's
// bundled development API is experimental.
//
// The WGSL plugin resolves the shader module graph at build time; identifiers
// are deliberately not minified because the resolved WGSL is also the
// interchange artifact the native target reflects by name
// (scripts/resolve-shaders.mjs).
import { wgslVitePlugin } from "vgpu/client";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  clearScreen: false,
  plugins: [wgslVitePlugin()],
  experimental: {
    bundledDev: mode !== "unbundled",
  },
  css: {
    // HUD and menu CSS use Lightning CSS during development as well as the
    // production minifier Vite 8 already selects.
    transformer: "lightningcss",
  },
  build: {
    // src/main.ts and direct Wasm ESM imports assemble with top-level await.
    target: "es2022",
    // Keep game assets independently cacheable and streamable instead of
    // growing JavaScript chunks with base64 payloads.
    assetsInlineLimit: 0,
    // A changed level or system chunk does not cascade new hashes through
    // every importing chunk in a deployed game.
    chunkImportMap: true,
  },
}));
