import type { ChunkEffect } from '../data/shipChunks';
import { WAVE_SKIP_MAX, WAVE_TIME_MIN_MUL } from './constants';

/**
 * The Free Fly trait chunks of a design added up (chunk 32c, docs/shipyard.md section 9). They act in normal Free Fly only: the world
 * reads them when it has no Frontier encounter, the wall world never reads them. Neutral = no change.
 * Stacking per copy: the multipliers multiply, the chances and heal rates add (the skip chance and the wave speed have a cap).
 */
export interface FlyTraits {
  /** x the length of a wave (Faster Waves < 1, Longer Waves > 1). */
  waveTimeMul: number;
  /** x the HP of ordinary enemies. */
  enemyHpMul: number;
  /** x the Cores a wave start pays. */
  wavePayMul: number;
  /** Chance a normal wave is skipped, 0..WAVE_SKIP_MAX. */
  waveSkip: number;
  /** Hull healed a second as a fraction of the max, while not hit for REPAIR_IDLE_SECONDS. */
  repairRate: number;
  /** x the damage of every shot, Free Fly only. */
  damageMul: number;
  /** x the Cores a boss pays. */
  bossCoresMul: number;
  /** x the HP of a boss. */
  bossHpMul: number;
}

export const NEUTRAL_FLY: Readonly<FlyTraits> = { waveTimeMul: 1, enemyHpMul: 1, wavePayMul: 1, waveSkip: 0, repairRate: 0, damageMul: 1, bossCoresMul: 1, bossHpMul: 1 };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** The Free Fly effects of a list of placed chunks (one effect per copy; undefined entries are skipped). */
export function flyTraitsOf(effects: readonly (ChunkEffect | undefined)[]): FlyTraits {
  let time = 1, hp = 1, pay = 1, skip = 0, repair = 0, dmg = 1, bossCores = 1, bossHp = 1;
  for (const e of effects) {
    if (!e) continue;
    time *= (1 - (e.waveSpeed ?? 0)) * (1 + (e.waveLength ?? 0));
    hp *= 1 + (e.enemyHp ?? 0);
    pay *= 1 + (e.wavePay ?? 0);
    skip += e.waveSkip ?? 0;
    repair += e.repair ?? 0;
    dmg *= 1 + (e.flyDamage ?? 0);
    bossCores += e.bossCores ?? 0;
    bossHp *= 1 + (e.bossHp ?? 0);
  }
  return {
    waveTimeMul: round3(Math.max(WAVE_TIME_MIN_MUL, time)), enemyHpMul: round3(hp), wavePayMul: round3(pay),
    waveSkip: round3(Math.min(WAVE_SKIP_MAX, skip)), repairRate: round3(repair), damageMul: round3(dmg), bossCoresMul: round3(bossCores), bossHpMul: round3(bossHp),
  };
}
