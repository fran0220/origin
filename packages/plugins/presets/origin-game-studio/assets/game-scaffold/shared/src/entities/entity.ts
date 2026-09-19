/**
 * What an entity is.
 *
 * An entity is a thing in the world with an id, a registered kind and a step.
 * It reads actions, never keys; it reads its numbers from `src/tuning.ts`,
 * never from itself. It never imports a scene — a scene decides which
 * entities exist, and an entity that reached back into one would make that
 * decision in two places.
 */

export type { Entity, EntityFactory } from "../core/contracts.js";
