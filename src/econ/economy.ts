import { CONFIG } from '../config';
import { BLOCKS } from '../data/blocks';
import { BLOCK_ECONOMY, capOf, UPGRADE_GROWTH, UPGRADE_MUL } from '../data/blockEconomy';
import { HULL_PRICES } from '../data/hulls';

/** Seconds of survival per tier step inside one run. */
export const TIER_SECONDS = 15;
/** Tier-1 Mitotic Rock HP: the first rock dies in three Dart + Flat+ shots (2 damage). Chunk 14a: 250 -> 5 (HP / 50). */
const TIER1_ROCK_HP = 5;
/** Reward of a parent rock at tier 1 (3 in the brief; raised to 7 after balance-econ and a bot run showed ~43 credits per default-circuit run). */
const PARENT_REWARD = 7;
/** The whole splitting family pays this multiple of what the parent alone would. */
export const FAMILY_MULT = 1.1;
/** Share of the family reward paid by each generation (index 0 = the parent). Sums to 1. */
export const GEN_SHARE = [0.4, 0.3, 0.18, 0.12];
/** Bodies per generation of a binary-splitting rock. */
export const GEN_BODIES = [1, 2, 4, 8];
/** Hull damage of a leaking rock, as a share of max hull, before the size factor. */
const LEAK_BASE = 0.1;
/** Size factor by generation: parent large (1.5x), second generation medium (1x), the rest small (0.5x). */
const LEAK_SIZE_MUL = [1.5, 1, 0.5, 0.5];


/** Base (first copy) price of every block for sale: the table in data/blockEconomy.ts. */
export const BASE_PRICE: Record<string, number> = {};
for (const [id, e] of Object.entries(BLOCK_ECONOMY)) BASE_PRICE[id] = e.base;

/** Shop price per hull (constants live in data/hulls.ts). */
export const HULL_PRICE: Record<string, number> = { ...HULL_PRICES };

/** New-game inventory: only these blocks are owned, everything else starts at 0. */
export const DEFAULT_OWNED: Record<string, number> = { turn_l: 2, turn_r: 2, flat_plus: 1 };

export const tierOfTime = (seconds: number) => 1 + Math.floor(Math.max(0, seconds) / TIER_SECONDS);
/** A director-spawned body's HP is a whole number, at least 1 (split children keep their exact share). */
export const wholeRockHp = (v: number) => Math.max(1, Math.round(v));
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

/** Price of the next copy when `owned` are held: base x growth^owned. */
export const copyPrice = (id: string, owned: number) => {
  const e = BLOCK_ECONOMY[id];
  return Math.max(1, Math.round((e?.base ?? 100) * Math.pow(e?.growth ?? 1, owned)));
};
export const upgradePrice = (id: string, level: number) =>
  Math.max(1, Math.round((BASE_PRICE[id] ?? 100) * UPGRADE_MUL * Math.pow(UPGRADE_GROWTH, level - 1)));
/** Copies one can own (Infinity = no cap) and whether the cap is reached. */
export const copyCap = capOf;
export const atCopyCap = (id: string, owned: number) => owned >= capOf(id);
export const maxLevelOf = (id: string) => BLOCKS[id]?.maxLevel ?? 1;
