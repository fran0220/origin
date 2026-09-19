/**
 * The OriginGame platform guard.
 *
 * The SDK is present when the game is hosted on the platform and absent when
 * it is served from anywhere else, so every call goes through the guard and
 * the game runs identically either way. The guard is kept even when the
 * platform features are declined: `ready()` on the first truly drawn frame is
 * what dismisses the platform's own loading screen, and a game that never
 * calls it hangs behind a spinner it cannot see.
 */

export interface OriginGamePlatform {
  ready?(): void;
  submitScore?(score: number): void;
  save?(payload: string): Promise<void>;
  load?(): Promise<string | null>;
}

const platform: OriginGamePlatform | null =
  (globalThis as { OG?: OriginGamePlatform }).OG ?? null;

let announced = false;

export function isPlatformHosted(): boolean {
  return platform !== null;
}

/**
 * Announce the first frame that actually drew something. Called on every
 * frame and honoured once: "the loop started" is not the same claim as
 * "the person can see the game".
 */
export function announceReady(drawn: boolean): void {
  if (announced || !drawn) {
    return;
  }
  announced = true;
  platform?.ready?.();
}

export function platformApi(): OriginGamePlatform | null {
  return platform;
}
