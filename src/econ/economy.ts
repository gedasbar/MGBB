import { CONFIG } from '../config';
import { BLOCKS } from '../data/blocks';

/** Seconds of survival per tier step inside one run. */
export const TIER_SECONDS = 15;
/** Tier-1 Mitotic Rock HP (the first rock dies in three starter shots). */
export const TIER1_ROCK_HP = 250;
/** Reward of a parent rock at tier 1 (3 in the brief; raised to 7 after balance-econ and a bot run showed ~43 credits per default-circuit run). */
export const PARENT_REWARD = 7;
/** The whole splitting family pays this multiple of what the parent alone would. */
export const FAMILY_MULT = 1.1;
/** Share of the family reward paid by each generation (index 0 = the parent). Sums to 1. */
export const GEN_SHARE = [0.4, 0.3, 0.18, 0.12];
/** Bodies per generation of a binary-splitting rock. */
export const GEN_BODIES = [1, 2, 4, 8];
/** Hull damage of a leaking rock, as a share of max hull, before the size factor. */
export const LEAK_BASE = 0.1;
/** Size factor by generation: parent large (1.5x), second generation medium (1x), the rest small (0.5x). */
export const LEAK_SIZE_MUL = [1.5, 1, 0.5, 0.5];

export const COPY_GROWTH = 1.18;
export const UPGRADE_MUL = 2.0;
export const UPGRADE_GROWTH = 2.2;

/** Base copy price of every block shown in the picker. */
export const BASE_PRICE: Record<string, number> = {
  turn_l: 40, turn_r: 40, flat_plus: 60, percent_mult: 120, lucky_strike: 100, jackpot: 150, gamblers_gate: 180,
  splitter_2: 200, splitter_3: 350, piercing: 250, bouncing: 250, aoe_circle: 300, aoe_rect: 300, shield_breaker: 220,
  pure_converter: 300, armor_piercer: 220, curving_right: 150, random_curve: 150, homing: 400, fork_impact: 450,
};

export const HULL_PRICE: Record<string, number> = { shuttle: 0, fan: 600 };

/** New-game inventory: only these blocks are owned, everything else starts at 0. */
export const DEFAULT_OWNED: Record<string, number> = { turn_l: 2, turn_r: 2, flat_plus: 1 };

export const tierOfTime = (seconds: number) => 1 + Math.floor(Math.max(0, seconds) / TIER_SECONDS);
export const rockHp = (tier: number) => TIER1_ROCK_HP * Math.pow(CONFIG.ECON.TIER_HP_GROWTH, tier - 1);
export const parentReward = (tier: number) => PARENT_REWARD * Math.pow(CONFIG.ECON.TIER_REWARD_GROWTH, tier - 1);

const genIndex = (generation: number, len: number) => Math.max(1, Math.min(len, generation)) - 1;

/** Credits paid by one body of the given generation (1 = parent). Later generations pay less each. */
export function rockReward(tier: number, generation: number): number {
  const g = genIndex(generation, GEN_SHARE.length);
  return (parentReward(tier) * FAMILY_MULT * GEN_SHARE[g]) / GEN_BODIES[g];
}

/** Hull damage of a rock that reaches the bottom edge. */
export function leakDamage(maxHull: number, generation: number): number {
  return maxHull * LEAK_BASE * LEAK_SIZE_MUL[genIndex(generation, LEAK_SIZE_MUL.length)];
}

export const copyPrice = (id: string, owned: number) => Math.max(1, Math.round((BASE_PRICE[id] ?? 100) * Math.pow(COPY_GROWTH, owned)));
export const upgradePrice = (id: string, level: number) =>
  Math.max(1, Math.round((BASE_PRICE[id] ?? 100) * UPGRADE_MUL * Math.pow(UPGRADE_GROWTH, level - 1)));
export const maxLevelOf = (id: string) => BLOCKS[id]?.maxLevel ?? 1;
