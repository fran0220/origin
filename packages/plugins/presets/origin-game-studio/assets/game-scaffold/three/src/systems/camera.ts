/**
 * `systems/camera` — the framing.
 *
 * Its job: drive the view's camera from the game's state. Follow behaviour,
 * lead, damping, shake and the framing used for review all belong here; the
 * view only draws through whatever this system left the camera at.
 *
 * Judge the game from the camera that ships. A system that looks right from a
 * scenery station and wrong from the chase camera is wrong.
 */

import type { System } from "../core/contracts.js";
import { unimplementedSystem } from "../core/seam.js";

export const camera: System = unimplementedSystem("systems/camera");
