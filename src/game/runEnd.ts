import type { World } from './world';
import type { ProgressStore, RunResult } from '../econ/progress';

/** The Free Fly run as the summary and the save see it. A quit mid-run reports exactly what the run has so far. */
export function flyRunResult(w: Pick<World, 'credits' | 'kills' | 'time' | 'maxTier' | 'wave'>): RunResult {
  return { credits: w.credits, kills: w.kills, time: w.time, tier: w.maxTier, wave: Math.max(1, w.wave) };
}

/** Banks a Free Fly run (crash, quit and restart all end here): credits so far are kept. Call once per run. */
export function bankFlyRun(w: Pick<World, 'credits' | 'kills' | 'time' | 'maxTier' | 'wave'>, store: Pick<ProgressStore, 'recordRun'>) {
  const result = flyRunResult(w);
  const marks = store.recordRun(result);
  return { result, marks };
}
