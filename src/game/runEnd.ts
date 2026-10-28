import type { World } from './world';
import type { ProgressStore, RunResult } from '../econ/progress';
import type { KillBanker } from '../captains/state';

/** The Free Fly run as the summary and the save see it. A quit mid-run reports exactly what the run has so far. */
export function flyRunResult(w: Pick<World, 'credits' | 'kills' | 'time' | 'maxTier' | 'wave'> & Partial<Pick<World, 'projSys'>>): RunResult {
  const r: RunResult = { credits: w.credits, kills: w.kills, time: w.time, tier: w.maxTier, wave: Math.max(1, w.wave) };
  if (w.projSys) r.shots = { ...w.projSys.runStats };
  return r;
}

/** Banks a Free Fly run (crash, quit and restart all end here): credits so far are kept. Call once per run. */
export function bankFlyRun(w: Pick<World, 'credits' | 'kills' | 'time' | 'maxTier' | 'wave'> & Partial<Pick<World, 'projSys'>>, store: Pick<ProgressStore, 'recordRun'>, banker?: KillBanker) {
  const result = flyRunResult(w);
  const marks = store.recordRun(result);
  // The kills go to the captain that flew the run (those already handed over at a pause are not counted twice).
  banker?.flush(w.kills);
  return { result, marks };
}
