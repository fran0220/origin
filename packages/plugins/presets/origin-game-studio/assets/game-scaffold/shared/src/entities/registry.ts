/**
 * The one place an entity kind becomes buildable.
 *
 * Every module in this directory is imported here and registers its kind.
 * That is what lets the design graph, the probe and the save system all name
 * the same thing the same way — and it is what `bun run check:arch` checks,
 * because an entity nobody registered is an entity nothing can spawn.
 */

import { EntityRegistry } from "../core/contracts.js";

export const entities = new EntityRegistry();
