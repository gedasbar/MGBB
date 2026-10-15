import { approachSpeedFor } from '../wall/constants';
import { armorFraction, blocksForRows, buildWall, shieldFraction, SPIKE_HP_MUL, TEMPLATE_COUNT } from '../wall/generator';
import { blockHp, LevelDef, rowsForTier, wholeHp } from '../wall/level';
import {
  MAP_ARMOR_MUL, MAP_BASE_TIER, MAP_HP_GROWTH, MAP_HP_NOISE, MAP_ROWS_MAX, MAP_ROWS_MIN, MAP_ROWS_MUL, MAP_SHARE_MAX,
  MAP_SHIELD_MUL, MAP_SPEED_MUL, MAP_SPIKE_CHANCE, MAP_TIER_NOISE, MAP_TIER_PER_RING,
} from './constants';
import { hash01, ring } from './world';

/** What a square holds. Only walls now; 15b adds more kinds. */
export type SquareKind = 'wall';

/** The parameters of a square's level: a pure function of the square and the world seed. */
export interface SquareParams {
  kind: SquareKind;
  x: number;
  y: number;
  ring: number;
  /** Whole effective tier (shown, and the tier the wall builder, rewards and background read). */
  tier: number;
  spike: boolean;
  template: number;
  rows: number;
  /** Block HP, spike multiplier included. */
  hp: number;
  armorFrac: number;
  shieldFrac: number;
  approachSpeed: number;
  seed: number;
}

// Independent rolls per lever (salts 10+ so they never meet the world's hole / medal salts).
const S_TIER = 10, S_HP = 11, S_ROWS = 12, S_ARMOR = 13, S_SHIELD = 14, S_SPEED = 15, S_SPIKE = 16, S_TPL = 17, S_SEED = 18;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const range = (r: [number, number], u: number) => lerp(r[0], r[1], u);

/** Effective tier before rounding: MAP_BASE_TIER + ring * MAP_TIER_PER_RING + noise in ±MAP_TIER_NOISE. */
export function effectiveTier(x: number, y: number, seed: number): number {
  const r = ring(x, y);
  return Math.max(1, Math.round(MAP_BASE_TIER + r * MAP_TIER_PER_RING + (hash01(x, y, seed, S_TIER) * 2 - 1) * MAP_TIER_NOISE));
}

/** Spike square: the same roll squareLevel makes (cheap, for drawing many squares). */
export const isSpikeSquare = (x: number, y: number, seed: number) => ring(x, y) > 0 && hash01(x, y, seed, S_SPIKE) < MAP_SPIKE_CHANCE;

/** Parameters of the square's wall. Every lever has its own seeded roll, so squares differ in more than HP. */
export function squareLevel(x: number, y: number, seed: number): SquareParams {
  const r = ring(x, y);
  const u = (salt: number) => hash01(x, y, seed, salt);
  const tier = effectiveTier(x, y, seed);
  const spike = isSpikeSquare(x, y, seed);
  const baseHp = blockHp(MAP_BASE_TIER) * Math.pow(MAP_HP_GROWTH, r) * (1 + (u(S_HP) * 2 - 1) * MAP_HP_NOISE);
  const rows = Math.max(MAP_ROWS_MIN, Math.min(MAP_ROWS_MAX, Math.round(rowsForTier(tier) * range(MAP_ROWS_MUL, u(S_ROWS)))));
  return {
    kind: 'wall', x, y, ring: r, tier, spike,
    template: Math.floor(u(S_TPL) * TEMPLATE_COUNT),
    rows,
    hp: wholeHp(baseHp * (spike ? SPIKE_HP_MUL : 1)),
    armorFrac: Math.min(MAP_SHARE_MAX, armorFraction(tier) * range(MAP_ARMOR_MUL, u(S_ARMOR))),
    shieldFrac: Math.min(MAP_SHARE_MAX, shieldFraction(tier) * range(MAP_SHIELD_MUL, u(S_SHIELD))),
    approachSpeed: approachSpeedFor(tier) * range(MAP_SPEED_MUL, u(S_SPEED)),
    seed: Math.floor(u(S_SEED) * 0x7fffffff),
  };
}

/** The square's wall, built by the campaign's own generator. Blocks wanted as in the campaign (blocksForRows). */
export function frontierLevel(p: SquareParams): LevelDef {
  const level = buildWall({
    tier: p.tier, seed: p.seed, template: p.template, rows: p.rows, target: blocksForRows(p.rows),
    hp: p.hp, armorFrac: p.armorFrac, shieldFrac: p.shieldFrac, approachSpeed: p.approachSpeed, spike: p.spike,
  });
  return { ...level, frontier: { x: p.x, y: p.y } };
}
