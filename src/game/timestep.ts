/**
 * Chunk 24a: how the main loop turns the time since the last frame into simulation steps. No frame rate is assumed: a frame is split
 * into the fewest equal steps that are each at most SIM_MAX_STEP long, so a 60 Hz screen runs one 1/60 s step a frame, a 120 Hz screen one
 * 1/120 s step a frame (the picture changes on EVERY frame, not every other one) and a long hitch runs several. The steps always add up to
 * the time that passed, so the game runs at the same speed on every screen.
 */
export const SIM_MAX_STEP = 1 / 60;
/** One frame never counts for more than this (a tab that was asleep does not fast-forward the game). */
export const FRAME_MAX = 0.25;

export interface StepPlan { steps: number; dt: number }

/** `elapsed` seconds to simulate (already capped to FRAME_MAX by the caller or by this function). */
export function planSteps(elapsed: number): StepPlan {
  const t = Math.min(Math.max(elapsed, 0), FRAME_MAX);
  if (t <= 0) return { steps: 0, dt: 0 };
  const steps = Math.max(1, Math.ceil(t / SIM_MAX_STEP - 1e-9));
  return { steps, dt: t / steps };
}
