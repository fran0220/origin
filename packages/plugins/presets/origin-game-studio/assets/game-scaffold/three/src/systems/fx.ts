/**
 * `systems/fx` — everything that reads as impact.
 *
 * Its job: particles, trails, hit flashes, screen effects and their budgets.
 * It draws from the seeded generator like everything else, so a replay looks
 * the same as the run it is compared against.
 *
 * Effects are the last thing to be added and the first thing to hide a wrong
 * direction. They never stand in for framing, palette or massing.
 */

import type { System } from "../core/contracts.js";
import { unimplementedSystem } from "../core/seam.js";

export const fx: System = unimplementedSystem("systems/fx");
