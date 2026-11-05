import { FLY_MEDAL_MILESTONES } from '../captains/data';
import { WAVE_TIME } from '../data/waves';
import { CORES_MILESTONE_PER_WAVE, CORES_WAVE_BASE, CORES_WAVE_PER_WAVE, ENCOUNTER_CORES_WAVE_CAP } from './constants';

/** Earning Cores (chunk 31a, docs/shipyard.md section 1): pure functions. Cores are earned in Free Fly and Frontier Free Fly squares only. */

/** Cores for the wave that has just started, `wave` >= 2 (wave `wave - 1` was survived); wave 1 pays nothing. */
export function coresForWave(wave: number): number {
  if (!(wave >= 2)) return 0;
  return Math.round(CORES_WAVE_BASE + CORES_WAVE_PER_WAVE * (wave - 2));
}

/** The bonus for reaching a Medal-wave milestone (5, 10, 15, 20, 30, 40, 50), 0 for any other wave. Paid in every run. */
export function milestoneCores(wave: number): number {
  return FLY_MEDAL_MILESTONES.some(m => m.wave === wave) ? CORES_MILESTONE_PER_WAVE * wave : 0;
}

/** Everything a normal Free Fly wave start pays (before the Core Magnet multiplier). */
export const waveStartCores = (wave: number): number => coresForWave(wave) + milestoneCores(wave);

/** A Frontier square pays this many Cores for each full WAVE_TIME seconds survived: one wave's Cores at the square's wave equivalent, capped. */
export const encounterCoresPerBlock = (waveEquivalent: number): number => coresForWave(Math.min(Math.max(2, Math.floor(waveEquivalent)), ENCOUNTER_CORES_WAVE_CAP));
export const ENCOUNTER_CORES_SECONDS = WAVE_TIME;

/** Cores of a Frontier encounter after `seconds` survived: one block per full ENCOUNTER_CORES_SECONDS. */
export function encounterCores(waveEquivalent: number, seconds: number): number {
  return Math.floor(Math.max(0, seconds) / ENCOUNTER_CORES_SECONDS) * encounterCoresPerBlock(waveEquivalent);
}

/** Total Cores of a normal Free Fly run that reached `wave` (waves 2..wave started, milestones included), for the income model. */
export function coresOfRun(wave: number): number {
  let n = 0;
  for (let w = 2; w <= wave; w++) n += waveStartCores(w);
  return n;
}
