/** After a resume, the first simulated step is cut to this many seconds of visual time (no jump, whatever the wait was). */
export const RESUME_MAX_FRAME = 1 / 30;

/**
 * Pause state of a run. While paused nothing is stepped at all (simulation, wave clock, scroll, timers, effects, background),
 * so there is nothing to "freeze": step() just says no. The first step after a resume is clamped so a long pause never
 * shows up as one big time step.
 */
export class PauseController {
  paused = false;
  /** Set by step(): the (possibly clamped) values to simulate with. */
  dt = 0;
  frameTime = 0;
  private clampNext = false;

  pause(): boolean {
    if (this.paused) return false;
    this.paused = true;
    return true;
  }

  resume(): boolean {
    if (!this.paused) return false;
    this.paused = false;
    this.clampNext = true;
    return true;
  }

  /** True when the screen should be updated with this.dt / this.frameTime; false while paused. */
  step(dt: number, frameTime: number): boolean {
    if (this.paused) return false;
    this.dt = dt;
    this.frameTime = frameTime;
    if (this.clampNext) {
      this.clampNext = false;
      if (this.frameTime > RESUME_MAX_FRAME) this.frameTime = RESUME_MAX_FRAME;
      if (this.dt > RESUME_MAX_FRAME) this.dt = RESUME_MAX_FRAME;
    }
    return true;
  }
}
