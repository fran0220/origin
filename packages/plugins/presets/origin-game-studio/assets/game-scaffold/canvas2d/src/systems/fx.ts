/**
 * `systems/fx` — everything that reads as impact.
 *
 * Its job: particles, trails, hit flashes, screen shake and their budgets,
 * painted as its own layer through the view. It draws from the seeded
 * generator like everything else, so a replay looks the same as the run it
 * is compared against.
 *
 * Effects on this substrate are fills, strokes and composite modes, and each
 * one costs a draw call the frame budget pays for. They are the last thing
 * to be added and the first thing to hide a wrong direction; they never
 * stand in for framing, palette or silhouette.
 */

import type { System } from "../core/contracts.js";
import { unimplementedSystem } from "../core/seam.js";

export const fx: System = unimplementedSystem("systems/fx");
