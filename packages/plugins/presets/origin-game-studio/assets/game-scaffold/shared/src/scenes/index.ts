/**
 * The scene state machine's seams.
 *
 * A scene owns what exists and what is being asked of the person right now;
 * it never owns a system. Transitions are asked for through `goTo` and settle
 * at the step boundary, so nothing is torn down while it is mid-step.
 *
 * `boot` is where a game always begins: it loads what the first playable
 * moment needs and hands over. A scene this game does not need is deleted
 * from the table together with its id in `SceneId`.
 */

import type { SceneTable } from "../core/contracts.js";
import { unimplementedScene } from "../core/seam.js";

export const scenes: SceneTable = {
  boot: () => unimplementedScene("boot"),
  title: () => unimplementedScene("title"),
  play: () => unimplementedScene("play"),
  pause: () => unimplementedScene("pause"),
  results: () => unimplementedScene("results"),
};
