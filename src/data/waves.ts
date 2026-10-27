import { CONFIG } from '../config';
import { TIER_SECONDS } from '../econ/economy';

/** Free Fly wave director and reward constants (chunk 10a). See docs/freefly-design.md. */

/** Seconds per wave; the next wave starts on the timer whether or not this one is cleared. */
export const WAVE_TIME = 40;
/** Spawns of a normal wave are spread over its first SPAWN_WINDOW seconds (the rest is a breather). */
export const SPAWN_WINDOW = 30;
/** Each spawn time moves by up to +- this many seconds (seeded). */
export const SPAWN_JITTER = 0.6;
/** Spawn budget in points (a basic Rock costs 4): BUDGET_BASE + BUDGET_STEP x (wave - 1). */
const BUDGET_BASE = 6;
const BUDGET_STEP = 3;
/**
 * Extra HP per wave on top of the tier's growth: HP x WAVE_HP_GROWTH^(wave - 1). Chunk 14a: 1.25 (was 1.08). With small
 * numbers and the hull ladder the strong builds span ~170x in DPS from the Dart to the Fan; at 1.08 the bot reached wave
 * 30+ with a Fan or Shuttle and 12-15 with a Twin (targets about 16/20 and 8, npm run balance-damage part D).
 */
const WAVE_HP_GROWTH = 1.25;
/** Every SPECIAL_EVERY-th wave is special: Swarm on odd multiples, Mother event on even ones. */
const SPECIAL_EVERY = 5;
/** Budget multiplier of a special wave. */
export const SPECIAL_BUDGET_MUL = 1.25;
/** A Swarm spawns within this many seconds. */
export const SWARM_WINDOW = 20;
/** A Swarm pebble: a basic rock born at this generation and radius, for this many points. */
export const PEBBLE_GENERATION = 3;
export const PEBBLE_RADIUS = 15;
export const PEBBLE_COST = 1;
/** Mother event: at least this many Mothers, in two groups (the second group this many seconds in). */
export const MOTHER_EVENT_MIN = 2;
export const MOTHER_EVENT_SECOND_GROUP = 12;
/** No new spawns while more than this many bodies are alive (they wait, they are not dropped). */
export const ALIVE_HOLD = 90;
/** Spawns keep this far from the screen sides (px, beyond the body's radius). */
export const SPAWN_EDGE = 8;

/** Multiplier on every Free Fly kill reward. */
export const FREEFLY_REWARD_MUL = 1;
/**
 * Free Fly pays kills at a slower tier than their HP: reward tier = 1 + (tier - 1) x this. HP still grows 1.055^tier, so a
 * long run's late waves are worth less per HP than early ones (a strong gun does not snowball). 1 = the plain tier.
 */
export const FREEFLY_REWARD_TIER_SCALE = 0.4;
export const freeFlyRewardTier = (tier: number) => 1 + (tier - 1) * FREEFLY_REWARD_TIER_SCALE;
/** Credits for reaching wave 5, 10, 15 ...: WAVE_BONUS x wave / 5. */
const WAVE_BONUS = 10;

export const waveBudget = (wave: number) => BUDGET_BASE + BUDGET_STEP * (Math.max(1, wave) - 1);
/**
 * Chunk 18b (docs/difficulty-audit.md, section E): from wave WAVE_SLOW_FROM on the TOTAL HP growth per wave (this multiplier
 * times the tier step that 40 s bring) is WAVE_SLOW_GROWTH: x1.19 up to wave 30, x1.08 up to 40, x1.06 after (today's total is about
 * x1.44). The last entry repeats. The Frontier's Free Fly squares use the same multiplier through their wave equivalent.
 */
export const WAVE_SLOW_FROM = 20;
export const WAVE_SLOW_GROWTH: readonly (readonly [number, number])[] = [[30, 1.19], [40, 1.08], [50, 1.06]];
/** HP factor the tier gains in one wave's time. */
export const tierStepPerWave = () => Math.pow(CONFIG.ECON.TIER_HP_GROWTH, WAVE_TIME / TIER_SECONDS);
/** Total growth of wave `wave` over wave `wave - 1` from WAVE_SLOW_FROM on (tier step included). */
export const slowWaveGrowth = (wave: number) => (WAVE_SLOW_GROWTH.find(([to]) => wave <= to) ?? WAVE_SLOW_GROWTH[WAVE_SLOW_GROWTH.length - 1])[1];
export function waveHpMul(wave: number): number {
  const w = Math.max(1, wave);
  let mul = Math.pow(WAVE_HP_GROWTH, Math.min(w, WAVE_SLOW_FROM) - 1);
  for (let k = WAVE_SLOW_FROM + 1; k <= w; k++) mul *= slowWaveGrowth(k) / tierStepPerWave();
  return mul;
}
const isSpecialWave = (wave: number) => wave % SPECIAL_EVERY === 0;
export type SpecialKind = 'swarm' | 'mothers' | null;
export const specialKind = (wave: number): SpecialKind =>
  !isSpecialWave(wave) ? null : (wave / SPECIAL_EVERY) % 2 === 1 ? 'swarm' : 'mothers';
/** Bonus credits paid when a wave starts (0 unless it is a multiple of 5). */
export const waveBonus = (wave: number) => (isSpecialWave(wave) ? (WAVE_BONUS * wave) / SPECIAL_EVERY : 0);
