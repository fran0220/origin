/**
 * Every asset this game loads, by relative path and by what it means.
 *
 * The role is not decoration: it decides how the file is decoded — colour
 * space for a texture, the frame grid for a sprite sheet — and a decision
 * made at the call site is a decision made differently in three places.
 * Paths stay relative — a provider URL expires, and an absolute path is one
 * machine's truth.
 *
 * Catalog assets are downloaded into the project and keep their attribution
 * beside them.
 */

import type { Asset } from "../core/assets.js";

export const manifest: readonly Asset[] = [];
