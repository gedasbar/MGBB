import { Mulberry32 } from '../rng';
import { CLASSIC_TIERS, LATE_HP_SEGMENTS, LATE_REWARD_GROWTH, LateEffects, LateType, DriftVariant } from '../data/lateTiers';
import {
  BLOCK_HP_BASE, BLOCK_HP_FIRST_END, BLOCK_HP_GROWTH, BLOCK_HP_SEGMENTS, DEFAULT_APPROACH_SPEED, WALL_ROWS_FIRST, WALL_ROWS_LAST, REWARD_BASE, REWARD_GROWTH, TEST_ARMOR, TEST_SHIELD_OF_HP, WALL_COLS,
} from './constants';

/** One block of a wall. `armor` uses the engine's armor formula (0 = none); `shield` is a pool absorbed before HP. */
export interface BlockDef { hp: number; armor: number; shield: number }

export interface LevelDef {
  tier: number;
  cols: number;
  rows: number;
  /** Ring wall: the world is `cols` x CELL wide and loops sideways. false = flat, with clamped edges (6c). Missing means true. */
  wrap?: boolean;
  /** Row-major, row 0 at the top of the wall. null = empty cell. */
  cells: (BlockDef | null)[];
  name?: string;
  hint?: string;
  /** Wall scroll speed in px/s while no living block touches the stop line. */
  approachSpeed: number;
  /** Set by the campaign generator: results of this level count toward the campaign progress. */
  campaign?: boolean;
  /** Spike tier: every block has 2x HP. */
  spike?: boolean;
  /** Hand-defined milestone tier (10, 20, ... 100). */
  milestone?: boolean;
  /** A Frontier square (chunk 15a): results count toward that square of the grid map. */
  frontier?: { x: number; y: number };
  /** Chunk 27a (tiers 101-200): the type of a type tier, its rank (1 = first appearance, harder each return) and the short line for the list and the panel. */
  lateType?: LateType;
  typeRank?: number;
  typeLine?: string;
  /** Multiplier on the credits of every destroyed block (a Monolith has few blocks). Missing means 1. */
  rewardMul?: number;
  /** Drift: the row speeds in px/s (positive = right), one per row, row 0 at the top. */
  drift?: { variant: DriftVariant; speeds: number[] };
  /** Chunk 27b: what a Strong Wind / Crosswind / Fog / Regrowth / Mitosis Wall tier does to the run. Missing = nothing. */
  effects?: LateEffects;
  /** Maze: the first open column of every row (row 0 at the top) and the path width. */
  mazePath?: number[];
  mazeWidth?: number;
}

/** Size curve: WALL_ROWS_FIRST rows at tier 1 growing linearly to WALL_ROWS_LAST rows at tier 100. */
export const rowsForTier = (tier: number) => Math.round(WALL_ROWS_FIRST + ((tier - 1) * (WALL_ROWS_LAST - WALL_ROWS_FIRST)) / 99);
/** HP are whole numbers, at least 1 (chunk 14a). */
export const wholeHp = (v: number) => Math.max(1, Math.round(v));
/** Block HP before rounding at a (possibly fractional) tier: the Frontier reads it at a ring's effective tier. Flat after the last segment. */
export function blockHpFloat(tier: number): number {
  const last = BLOCK_HP_SEGMENTS[BLOCK_HP_SEGMENTS.length - 1][0];
  const t = Math.min(Math.max(1, tier), last);
  let hp = BLOCK_HP_BASE * Math.pow(BLOCK_HP_GROWTH, Math.min(t, BLOCK_HP_FIRST_END) - 1);
  let from = BLOCK_HP_FIRST_END;
  for (const [to, growth] of BLOCK_HP_SEGMENTS) {
    if (t > from) hp *= Math.pow(growth, Math.min(t, to) - from);
    from = to;
  }
  return hp;
}
export const blockHp = (tier: number) => wholeHp(blockHpFloat(tier));
/** Chunk 27a: block HP of a late tier (101-200) before rounding: the HP of tier 100, then LATE_HP_SEGMENTS. Tiers up to 100 read blockHpFloat. */
export function lateBlockHpFloat(tier: number): number {
  let hp = blockHpFloat(CLASSIC_TIERS);
  let from = CLASSIC_TIERS;
  for (const [to, growth] of LATE_HP_SEGMENTS) {
    if (tier > from) hp *= Math.pow(growth, Math.min(tier, to) - from);
    from = to;
  }
  return hp;
}
export const lateBlockHp = (tier: number) => wholeHp(lateBlockHpFloat(tier));
/** The campaign's block HP at any tier 1..200. (The Frontier keeps reading blockHpFloat, which is flat after tier 100.) */
export const campaignBlockHp = (tier: number) => (tier > CLASSIC_TIERS ? lateBlockHp(tier) : blockHp(tier));
export const rewardPerBlock = (tier: number) => REWARD_BASE * Math.pow(REWARD_GROWTH, tier - 1);
/** Chunk 27a: credits per destroyed block of a CAMPAIGN tier: rewardPerBlock up to tier 100, then LATE_REWARD_GROWTH a tier. (Frontier squares keep rewardPerBlock at their effective tier.) */
export const campaignRewardPerBlock = (tier: number) =>
  tier <= CLASSIC_TIERS ? rewardPerBlock(tier) : rewardPerBlock(CLASSIC_TIERS) * Math.pow(LATE_REWARD_GROWTH, tier - CLASSIC_TIERS);

export const countBlocks = (level: LevelDef) => level.cells.reduce((n, c) => n + (c ? 1 : 0), 0);
export const totalHp = (level: LevelDef) => level.cells.reduce((s, c) => s + (c ? c.hp : 0), 0);

export interface TestWallOpts {
  tier: number;
  rows: number;
  /** Share of blocks (0..1) that get armor. */
  armorFraction?: number;
  /** Share of blocks (0..1) that get a shield. */
  shieldFraction?: number;
  /** Number of empty cells punched into the wall. */
  gaps?: number;
  approachSpeed?: number;
}

/**
 * A full 21 x rows wall of tier-`tier` blocks for tests and the debug entry point. The armored, shielded and empty
 * cells are picked by a seeded generator, so the same options always give the same wall.
 */
export function makeTestWall(o: TestWallOpts): LevelDef {
  const rand = new Mulberry32(o.tier * 7919 + o.rows * 31 + 17);
  const hp = blockHp(o.tier);
  const cells: (BlockDef | null)[] = [];
  for (let i = 0; i < WALL_COLS * o.rows; i++) {
    const armored = rand.next() < (o.armorFraction ?? 0);
    const shielded = rand.next() < (o.shieldFraction ?? 0);
    cells.push({ hp, armor: armored ? TEST_ARMOR : 0, shield: shielded ? wholeHp(hp * TEST_SHIELD_OF_HP) : 0 });
  }
  const gaps = Math.min(o.gaps ?? 0, cells.length - 1);
  for (let g = 0; g < gaps; g++) {
    let i = Math.floor(rand.next() * cells.length);
    while (cells[i] === null) i = (i + 1) % cells.length;
    cells[i] = null;
  }
  return { tier: o.tier, cols: WALL_COLS, rows: o.rows, wrap: true, cells, name: `Test wall ${o.tier}`, approachSpeed: o.approachSpeed ?? DEFAULT_APPROACH_SPEED };
}
