/**
 * `systems/input` — the action map.
 *
 * Its job: turn keyboard, pointer and touch into named actions the rest of
 * the game reads, so nothing above this layer ever asks about a key. Every
 * source binds to the same action names, and a replayed event enters through
 * `inject` — the same path a person's key press takes — because a script that
 * bypassed the action map would prove nothing about how the game plays.
 *
 * Key repeat, held state and per-tick edges are this system's problem, not
 * the scene's. Bindings and dead zones are tunables and live in
 * `src/tuning.ts`.
 */

import type { InputSystem } from "../core/contracts.js";
import { unimplementedInputSystem } from "../core/seam.js";

export const input: InputSystem = unimplementedInputSystem("systems/input");
