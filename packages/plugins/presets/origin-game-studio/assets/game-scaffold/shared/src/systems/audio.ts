/**
 * `systems/audio` — the bus layout.
 *
 * Its job: own the buses (music, effects, ambience, interface), their gains
 * and their ducking, and hand the rest of the game names rather than files.
 * Browsers refuse audio before a gesture, so the unlock belongs here too, and
 * the game must be playable and silent until it happens.
 *
 * Levels are tunables and live in `src/tuning.ts`.
 */

import type { System } from "../core/contracts.js";
import { unimplementedSystem } from "../core/seam.js";

export const audio: System = unimplementedSystem("systems/audio");
