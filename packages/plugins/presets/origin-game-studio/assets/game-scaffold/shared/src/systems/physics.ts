/**
 * `systems/physics` — the world that moves bodies.
 *
 * Its job: own the physics world, step it, and keep every body keyed by the
 * registry entity it moves. Three rules keep it inside the determinism
 * contract, and a stored input script proves nothing if any is broken:
 *
 * - the engine compiles in `load`, the one asynchronous moment assembly
 *   awaits; the world is built in `start` from the seeded run and stepped
 *   **only** inside `step(dt)`, at the fixed step, never from a frame
 *   callback or a clock of its own;
 * - a body is looked up by entity id and never the other way round — the
 *   entity's `transform()` reads the body, and nothing keeps a copy;
 * - `snapshot()` answers the probe with the bodies as they stand, so a replay
 *   that diverges is caught in the numbers and not guessed at from the picture.
 *
 * Fill it from the registry's `physics/` entries (Rapier, deterministic build,
 * 2D or 3D as the substrate is), never from memory. Gravity, restitution,
 * friction and every other feel number live in `src/tuning.ts`.
 */

import type { PhysicsSystem } from "../core/contracts.js";
import { unimplementedPhysicsSystem } from "../core/seam.js";

export const physics: PhysicsSystem = unimplementedPhysicsSystem("systems/physics");
