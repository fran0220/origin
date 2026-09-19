/**
 * `systems/save` — durable state.
 *
 * Its job: decide what survives a reload, write it, and read it back into a
 * game that may have changed shape since. A save that cannot be read by a
 * later build is worse than no save, so the payload carries its own version
 * and an unreadable one is discarded loudly rather than half-applied.
 *
 * On the platform the payload goes through the guarded `OG` API and stays
 * within its size budget; off the platform it is local storage. Which of the
 * two is not the caller's business.
 */

import type { System } from "../core/contracts.js";
import { unimplementedSystem } from "../core/seam.js";

export const save: System = unimplementedSystem("systems/save");
