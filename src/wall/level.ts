import { Mulberry32 } from '../rng';
import {
  BLOCK_HP_BASE, BLOCK_HP_GROWTH, DEFAULT_APPROACH_SPEED, REWARD_BASE, REWARD_GROWTH, TEST_ARMOR, TEST_SHIELD_OF_HP, WALL_COLS,
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
}

/** Placeholder size curve: 8 rows at tier 1 growing linearly to 41 rows at tier 100. */
export const rowsForTier = (tier: number) => Math.round(8 + ((tier - 1) * (41 - 8)) / 99);
/** HP are whole numbers, at least 1 (chunk 14a). */
export const wholeHp = (v: number) => Math.max(1, Math.round(v));
export const blockHp = (tier: number) => wholeHp(BLOCK_HP_BASE * Math.pow(BLOCK_HP_GROWTH, tier - 1));
export const rewardPerBlock = (tier: number) => REWARD_BASE * Math.pow(REWARD_GROWTH, tier - 1);

export const cellIndex = (level: { cols: number }, col: number, row: number) => row * level.cols + col;
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
