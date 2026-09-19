/**
 * The fixed-step loop.
 *
 * `step(dt)` moves the world and `render(alpha)` only draws. Keeping them
 * strictly apart is what makes a stored input script replay to the same world,
 * which is in turn what makes every regression assertion and every
 * before/after comparison mean anything. A world moved from `render` is a
 * world that moves differently on a faster machine.
 */

/** The simulation's one step size. Frame rate varies; this never does. */
export const STEP_SECONDS = 1 / 60;

/**
 * The most steps one frame may catch up by. Past this the loop drops the
 * backlog rather than spiralling: a long stall is honest lost time, not a
 * burst of simulation nobody saw.
 */
const MAX_CATCH_UP_STEPS = 8;

export interface Simulation {
  step(dt: number): void;
  render(alpha: number): void;
}

export interface Clock {
  /** Seconds, monotonic. */
  now(): number;
}

export const wallClock: Clock = {
  now: () => performance.now() / 1000,
};

export type Schedule = (frame: () => void) => void;

export class FixedStepLoop {
  private readonly simulation: Simulation;
  private readonly clock: Clock;
  private accumulator = 0;
  private last: number | null = null;
  private ticks = 0;
  private drawn = false;
  private running = false;
  private paused = false;

  constructor(simulation: Simulation, clock: Clock = wallClock) {
    this.simulation = simulation;
    this.clock = clock;
  }

  /** How many steps the world has taken. The probe reports this as the tick. */
  get tick(): number {
    return this.ticks;
  }

  /** Whether a frame has actually been drawn yet. */
  get hasDrawn(): boolean {
    return this.drawn;
  }

  /**
   * Advance the world by whole steps, ignoring the wall clock entirely.
   *
   * This is the deterministic path the probe and the stage stand on: the same
   * step count from the same seed and the same input always lands on the same
   * world.
   */
  advance(steps: number): number {
    for (let taken = 0; taken < steps; taken += 1) {
      this.simulation.step(STEP_SECONDS);
      this.ticks += 1;
    }
    if (steps > 0) {
      // Deterministic advance is also the Stage's single-step path. A step
      // that changed state without drawing would leave the paused picture on
      // the previous tick and make the control appear inert.
      this.simulation.render(0);
      this.drawn = true;
    }
    return this.ticks;
  }

  /** One frame against real elapsed time, then one draw. */
  frame(): void {
    const now = this.clock.now();
    const elapsed = this.last === null ? 0 : now - this.last;
    this.last = now;
    this.accumulator += elapsed;

    let taken = 0;
    while (this.accumulator >= STEP_SECONDS && taken < MAX_CATCH_UP_STEPS) {
      this.simulation.step(STEP_SECONDS);
      this.accumulator -= STEP_SECONDS;
      this.ticks += 1;
      taken += 1;
    }
    if (this.accumulator > STEP_SECONDS * MAX_CATCH_UP_STEPS) {
      this.accumulator = 0;
    }

    this.simulation.render(this.accumulator / STEP_SECONDS);
    this.drawn = true;
  }

  start(schedule: Schedule = (frame) => requestAnimationFrame(() => frame())): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.paused = false;
    const pump = (): void => {
      if (!this.running) {
        return;
      }
      if (!this.paused) {
        this.frame();
      }
      schedule(pump);
    };
    schedule(pump);
  }

  /** Hold the ordinary wall-clock loop without destroying simulation state. */
  pause(): boolean {
    if (!this.running) {
      return false;
    }
    this.paused = true;
    // Time spent paused is not a simulation backlog to catch up on.
    this.last = null;
    this.accumulator = 0;
    return true;
  }

  /** Continue from the held state on the next animation frame. */
  resume(): boolean {
    if (!this.running) {
      return false;
    }
    this.paused = false;
    this.last = null;
    return true;
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    this.last = null;
    this.accumulator = 0;
  }
}
