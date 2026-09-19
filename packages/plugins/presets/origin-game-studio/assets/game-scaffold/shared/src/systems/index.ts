/**
 * The systems this game is assembled from, in start and step order.
 *
 * Input runs before anything reads an action; physics moves the world after
 * input and before anything reads a position; the camera runs after the
 * world has moved. A seam the accepted design has no node for is deleted from
 * this list and its file removed — leaving it here means the game is expected
 * to have it, and assembly will say so.
 */

import type { System } from "../core/contracts.js";
import { audio } from "./audio.js";
import { camera } from "./camera.js";
import { fx } from "./fx.js";
import { input } from "./input.js";
import { physics } from "./physics.js";
import { save } from "./save.js";

export const systems: readonly System[] = [input, physics, save, audio, fx, camera];
