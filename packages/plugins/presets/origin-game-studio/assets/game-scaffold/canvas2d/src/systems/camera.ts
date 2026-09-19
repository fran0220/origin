/**
 * `systems/camera` — the framing.
 *
 * Its job: leave the view's `framing` — the world point at the centre and
 * the zoom — where the game's state says it should be. Follow behaviour,
 * lead, damping, shake, room locking and the framing used for review all
 * belong here; the view only draws through whatever this system left the
 * framing at.
 *
 * Judge the game from the framing that ships. A layout that reads at the
 * stage's zoom and not at the player's is wrong.
 */

import type { System } from "../core/contracts.js";
import { unimplementedSystem } from "../core/seam.js";

export const camera: System = unimplementedSystem("systems/camera");
