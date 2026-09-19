#!/usr/bin/env bun
// The headless still: render one shader entry to pixels without a browser,
// through the same vgpu/node (Dawn) path `check:wgsl` validates against.
// It answers with measured facts — size, per-channel range and mean, how much
// of the frame the clear color still owns, the corner and center texels — so
// a shader is judged by numbers first; `--out` writes the PNG when the
// composition itself needs judging.
//
// A frame from here is evidence labeled headless(dawn): it is the shader's
// own pixels, never a substitute for a preview(cdp) capture of the page.
//
// Usage:
//   bun scripts/render-still.mjs src/shaders/entry.wgsl \
//     [--size 256x256] [--set params.time=1.5] [--set params.tint=[1,0,0]] \
//     [--out scratch/still.png]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { resolveShader } from "@vgpu/wgsl/runtime";
import { effect, init, target } from "vgpu/node";

const args = process.argv.slice(2);
let entry;
let size = [256, 256];
let out;
const sets = [];
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--size") {
    const match = /^(\d+)x(\d+)$/.exec(args[++i] ?? "");
    if (!match) fail("--size wants WIDTHxHEIGHT, like --size 256x256");
    size = [Number(match[1]), Number(match[2])];
  } else if (arg === "--set") {
    const pair = /^([^=]+)=(.+)$/.exec(args[++i] ?? "");
    if (!pair) fail("--set wants binding.member=value");
    sets.push([pair[1].split("."), JSON.parse(pair[2])]);
  } else if (arg === "--out") {
    out = resolve(args[++i] ?? fail("--out wants a file path"));
  } else if (!entry) {
    entry = resolve(arg);
  } else {
    fail(`one entry per still; unexpected argument ${arg}`);
  }
}
if (!entry) fail("render-still wants a shader entry: bun scripts/render-still.mjs <shader.wgsl>");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const { wgsl } = await resolveShader({ entry, validate: "off" });
const gpu = await init();
try {
  const still = target(gpu, { size });
  const pass = effect(gpu, wgsl);
  if (sets.length > 0) {
    const bag = {};
    for (const [path, value] of sets) {
      let cursor = bag;
      for (const key of path.slice(0, -1)) cursor = cursor[key] ??= {};
      cursor[path[path.length - 1]] = value;
    }
    pass.set(bag);
  }
  pass.draw(still);
  const pixels = await still.read();
  const [width, height] = still.size;

  const stats = channelStats(pixels);
  const texel = (x, y) => Array.from(pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
  const facts = {
    entry,
    size: { width, height },
    format: still.format,
    channels: stats,
    clearColorFraction: clearFraction(pixels),
    texels: {
      topLeft: texel(0, 0),
      topRight: texel(width - 1, 0),
      center: texel(width >> 1, height >> 1),
      bottomLeft: texel(0, height - 1),
      bottomRight: texel(width - 1, height - 1),
    },
  };
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, encodePng(pixels, width, height));
    facts.out = out;
  }
  process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
} finally {
  gpu.dispose();
}

// Per-channel min/max/mean over the raw RGBA bytes.
function channelStats(pixels) {
  const names = ["r", "g", "b", "a"];
  return names.map((name, channel) => {
    let min = 255;
    let max = 0;
    let sum = 0;
    for (let i = channel; i < pixels.length; i += 4) {
      const v = pixels[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { channel: name, min, max, mean: Number((sum / (pixels.length / 4)).toFixed(2)) };
  });
}

// How much of the frame is still the default clear color [0,0,0,255] — a
// shader that drew nothing answers 1 here instead of looking "dark but fine".
function clearFraction(pixels) {
  let cleared = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] === 0 && pixels[i + 1] === 0 && pixels[i + 2] === 0 && pixels[i + 3] === 255) {
      cleared += 1;
    }
  }
  return Number((cleared / (pixels.length / 4)).toFixed(4));
}

// Minimal RGBA8 PNG emit — filter 0 rows through node's own deflate. A still
// is a scratch instrument, so no image dependency enters the project for it.
function encodePng(pixels, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(
      raw,
      y * (width * 4 + 1) + 1,
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // color type RGBA
  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat(chunks);
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, tail]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
