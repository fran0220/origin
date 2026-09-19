/**
 * `ui/hud` — the interface layer, separate from the scenes.
 *
 * Its job: everything the person reads that is not the world — score, state,
 * prompts, menus. It is DOM over the canvas rather than geometry in it, so it
 * stays crisp, stays readable at any resolution, and can be resolved by the
 * annotation loop through its DOM path.
 *
 * It reads game state and never writes it.
 */

import type { Hud } from "../core/contracts.js";
import { unimplementedHud } from "../core/seam.js";

export const hud: Hud = unimplementedHud();
