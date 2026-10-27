import { Mulberry32 } from '../rng';
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
  /** Spike tier: every block has 1.6x HP. */
  spike?: boolean;
  /** Hand-defined milestone tier (10, 20, ... 100). */
  milestone?: boolean;
  /** A Frontier square (chunk 15a): results count toward that square of the grid map. */
  frontier?: { x: number; y: number };
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
export const rewardPerBlock = (tier: number) => REWARD_BASE * Math.pow(REWARD_GROWTH, tier - 1);

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
