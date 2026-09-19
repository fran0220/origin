/**
 * How an unbuilt seam behaves.
 *
 * It throws, with its own name, at assembly. A silent no-op would let a game
 * ship without its audio, its save or its camera and look finished until
 * someone played it; a throw cannot be shipped around, only implemented or
 * deleted. Which of the two is right is the accepted design's answer, in
 * `docs/design/systems.md` — a seam this game has no design node for is
 * deleted outright rather than left throwing.
 */

import type { Hud, InputSystem, PhysicsSystem, Scene, SceneId, System } from "./contracts.js";

export function notImplemented(seam: string): never {
  throw new Error(`${seam} is not implemented`);
}

export function unimplementedSystem(name: string): System {
  return {
    name,
    start: () => notImplemented(name),
    step: () => notImplemented(name),
  };
}

export function unimplementedInputSystem(name: string): InputSystem {
  return {
    name,
    start: () => notImplemented(name),
    step: () => notImplemented(name),
    inject: () => notImplemented(name),
  };
}

export function unimplementedPhysicsSystem(name: string): PhysicsSystem {
  return {
    name,
    start: () => notImplemented(name),
    step: () => notImplemented(name),
    snapshot: () => notImplemented(name),
  };
}

export function unimplementedScene(id: SceneId): Scene {
  const name = `scenes/${id}`;
  return {
    id,
    enter: () => notImplemented(name),
    exit: () => notImplemented(name),
    step: () => notImplemented(name),
    render: () => notImplemented(name),
  };
}

export function unimplementedHud(): Hud {
  const name = "ui/hud";
  return {
    mount: () => notImplemented(name),
    update: () => notImplemented(name),
  };
}
