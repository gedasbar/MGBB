import type { World } from './world';
import type { ProgressStore, RunResult } from '../econ/progress';
import type { KillBanker } from '../captains/state';

/** The Free Fly run as the summary and the save see it. A quit mid-run reports exactly what the run has so far. */
export function flyRunResult(w: Pick<World, 'credits' | 'kills' | 'time' | 'maxTier' | 'wave'> & Partial<Pick<World, 'projSys' | 'cores' | 'bossesDefeated' | 'crystals' | 'hullId' | 'everHurt'>>, daily = false): RunResult {
  const r: RunResult = { credits: w.credits, cores: w.cores ?? 0, kills: w.kills, time: w.time, tier: w.maxTier, wave: Math.max(1, w.wave) };
  if (w.hullId) r.hull = w.hullId;
  if (w.everHurt === false) r.noHit = true;
  if (daily) r.daily = true;
  if (w.projSys) r.shots = { ...w.projSys.runStats };
  if (w.crystals) r.crystals = { collected: w.crystals.collected, dropped: w.crystals.dropped };
  if (w.bossesDefeated && w.bossesDefeated.length) r.bosses = w.bossesDefeated.map(b => ({ id: b.id, noHit: b.noHit }));
  return r;
}

/** Banks a Free Fly run (crash, quit and restart all end here): credits so far are kept. Call once per run. */
export function bankFlyRun(w: Parameters<typeof flyRunResult>[0], store: Pick<ProgressStore, 'recordRun'>, banker?: KillBanker, daily = false) {
  const result = flyRunResult(w, daily);
  const marks = store.recordRun(result);
  // The kills go to the captain that flew the run (those already handed over at a pause are not counted twice).
  banker?.flush(w.kills);
  return { result, marks };
}
