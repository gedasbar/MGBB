/** Free Fly wave director and reward constants (chunk 10a). See docs/freefly-design.md. */

/** Seconds per wave; the next wave starts on the timer whether or not this one is cleared. */
export const WAVE_TIME = 40;
/** Spawns of a normal wave are spread over its first SPAWN_WINDOW seconds (the rest is a breather). */
export const SPAWN_WINDOW = 30;
/** Each spawn time moves by up to +- this many seconds (seeded). */
export const SPAWN_JITTER = 0.6;
/** Spawn budget in points (a basic Rock costs 4): BUDGET_BASE + BUDGET_STEP x (wave - 1). */
export const BUDGET_BASE = 6;
export const BUDGET_STEP = 3;
/** Extra HP per wave on top of the tier's growth: HP x WAVE_HP_GROWTH^(wave - 1). */
export const WAVE_HP_GROWTH = 1.08;
/** Every SPECIAL_EVERY-th wave is special: Swarm on odd multiples, Mother event on even ones. */
export const SPECIAL_EVERY = 5;
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
export const WAVE_BONUS = 10;

export const waveBudget = (wave: number) => BUDGET_BASE + BUDGET_STEP * (Math.max(1, wave) - 1);
export const waveHpMul = (wave: number) => Math.pow(WAVE_HP_GROWTH, Math.max(1, wave) - 1);
export const isSpecialWave = (wave: number) => wave % SPECIAL_EVERY === 0;
export type SpecialKind = 'swarm' | 'mothers' | null;
export const specialKind = (wave: number): SpecialKind =>
  !isSpecialWave(wave) ? null : (wave / SPECIAL_EVERY) % 2 === 1 ? 'swarm' : 'mothers';
/** Bonus credits paid when a wave starts (0 unless it is a multiple of 5). */
export const waveBonus = (wave: number) => (isSpecialWave(wave) ? (WAVE_BONUS * wave) / SPECIAL_EVERY : 0);
/** Wave number at a run time (1 at t = 0). */
export const waveAt = (seconds: number) => 1 + Math.floor(Math.max(0, seconds) / WAVE_TIME);
