import { fmtBig } from './format';

/** The two extra lines of the run summary (chunk 21a): the largest single hit and the damage per second over the whole run. */
export interface ShotLines { bestShot: string; avgDps: string }

/** Average DPS = total damage dealt / run time (0 for a run with no time or no damage); both formatted K/M/B. */
export function avgDps(totalDamage: number, time: number): number {
  return time > 0 && totalDamage > 0 ? totalDamage / time : 0;
}

export function shotLines(shots: { bestShot: number; totalDamage: number } | undefined, time: number): ShotLines | null {
  if (!shots) return null;
  return { bestShot: fmtBig(shots.bestShot), avgDps: fmtBig(avgDps(shots.totalDamage, time)) };
}
