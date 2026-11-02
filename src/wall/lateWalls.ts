// Chunk 27a: the walls of campaign tiers 101-200 (docs/tiers-101-200.md). Pure functions of the tier number, like generateLevel.
// An ordinary tier is a hard wall built by the same builder as tiers 1-100 (`buildWall`); the four layout types (Monolith, Maze,
// Fortress, Drift) are built here. The five types of chunk 27b are ordinary hard walls that keep their type in `lateType`.
import { Mulberry32 } from '../rng';
import {
  byRank, DRIFT_BLOCKS, DRIFT_EACH_SPAN, DRIFT_GAP_SHARE, DRIFT_HP_MUL, DRIFT_SPEED_BASE, DRIFT_SPEED_PER_RANK, DRIFT_VARIANT, DriftVariant, FORTRESS_ARMOR, FORTRESS_HP_MUL,
  FORTRESS_SHIELD_SHARE, isLateMilestone, LATE_ARMOR_FRAC, LATE_FIRST, LATE_LAST, LATE_MILESTONES, LATE_ROWS, LATE_SHIELD_FRAC, LATE_TYPES, lateSlot,
  MAZE_HP_MUL, MAZE_PATH_WIDTH, MAZE_ROWS, MAZE_TURN_ROWS, MONOLITH_HP_MUL, MONOLITH_REWARD_SHARE, MONOLITH_ROWS,
} from '../data/lateTiers';
import { approachSpeedFor, WALL_COLS } from './constants';
import { armorValueOf, blocksForRows, buildWall, shieldShareOf, TEMPLATE_COUNT, WallSpec } from './generator';
import { BlockDef, lateBlockHp, LevelDef, wholeHp } from './level';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lateT = (tier: number) => (tier - 100) / (LATE_LAST - 100);
/** Share of blocks armored / shielded at a late tier (ordinary walls and drift). */
export const lateArmorFraction = (tier: number) => lerp(LATE_ARMOR_FRAC[0], LATE_ARMOR_FRAC[1], lateT(tier));
export const lateShieldFraction = (tier: number) => lerp(LATE_SHIELD_FRAC[0], LATE_SHIELD_FRAC[1], lateT(tier));

export const DRIFT_LINES: Record<DriftVariant, string> = {
  same: 'Drift: all rows slide the same way.',
  alternate: 'Drift: neighbouring rows slide opposite ways.',
  each: 'Drift: every row slides its own way and speed.',
};

const cache = new Map<number, LevelDef>();

/** The wall of a tier 101-200. Pure: the same tier always gives the same wall. */
export function buildLateLevel(tier: number): LevelDef {
  const t = Math.max(LATE_FIRST, Math.min(LATE_LAST, Math.floor(tier)));
  const hit = cache.get(t);
  if (hit) return hit;
  const slot = lateSlot(t);
  const type = slot && LATE_TYPES[slot.type].built ? slot.type : null;
  const rank = slot?.rank ?? 1;
  const base = type === 'monolith' ? monolith(t, rank) : type === 'maze' ? maze(t, rank) : type === 'drift' ? drift(t, rank) : ordinary(t, type === 'fortress' ? rank : 0);
  const level: LevelDef = {
    ...base,
    ...(slot ? { lateType: slot.type, typeRank: slot.rank, typeLine: base.typeLine ?? LATE_TYPES[slot.type].line } : {}),
  };
  cache.set(t, level);
  return level;
}

/** The shape of an ordinary wall: one of the classic generator's eight templates, picked from the tier number. */
const pickTemplate = (t: number) => Math.floor(new Mulberry32(t * 31337 + 7).next() * TEMPLATE_COUNT);
const common = (t: number) => ({ tier: t, cols: WALL_COLS, wrap: true, approachSpeed: approachSpeedFor(t), campaign: true }) as const;

/**
 * An ordinary hard wall, or (fortressRank > 0) a Fortress: the same walls with every block armored and shielded, heavier than the
 * ordinary shares. A milestone tier (every 10th) uses the shape of the classic milestone 100 tiers earlier under a new name.
 */
function ordinary(t: number, fortressRank: number): LevelDef {
  const ms = isLateMilestone(t) && !fortressRank;
  let template = pickTemplate(t);
  if (t > LATE_FIRST && template === pickTemplate(t - 1)) template = (template + 1) % TEMPLATE_COUNT; // never the same shape twice in a row
  const hp = wholeHp(lateBlockHp(t) * (fortressRank ? FORTRESS_HP_MUL : 1));
  const spec: WallSpec = {
    tier: t, seed: t * 1000003 + 12345, template, ...(ms ? { milestoneTier: t - 100 } : {}),
    rows: LATE_ROWS, target: blocksForRows(LATE_ROWS), hp,
    armorFrac: fortressRank ? 1 : lateArmorFraction(t), shieldFrac: fortressRank ? 1 : lateShieldFraction(t),
    approachSpeed: approachSpeedFor(t), spike: false, campaign: true,
  };
  const lvl = buildWall(spec);
  if (!fortressRank) return ms ? { ...lvl, name: LATE_MILESTONES[t].name, hint: LATE_MILESTONES[t].hint } : lvl;
  const armor = byRank(FORTRESS_ARMOR, fortressRank);
  const shield = wholeHp(hp * byRank(FORTRESS_SHIELD_SHARE, fortressRank));
  return {
    ...lvl, name: `Fortress ${lvl.name}`, hint: 'Every block is armored and has a shield: armor-piercing and shield-breaking damage count.',
    cells: lvl.cells.map(c => (c ? { hp: c.hp, armor, shield } : null)),
  };
}

/** MONOLITH: full-width rows of huge blocks (no gap on the cylinder): at least one block of every row has to be broken to pass. */
function monolith(t: number, rank: number): LevelDef {
  const rows = byRank(MONOLITH_ROWS, rank);
  const hp = wholeHp(lateBlockHp(t) * byRank(MONOLITH_HP_MUL, rank));
  const cells: (BlockDef | null)[] = new Array(rows * WALL_COLS).fill(null).map(() => ({ hp, armor: 0, shield: 0 }));
  return {
    ...common(t), rows, cells, name: 'Monolith', hint: `A wall of ${rows === 1 ? 'one row' : `${rows} rows`} of huge blocks with no way round: break one to pass.`,
    typeLine: LATE_TYPES.monolith.line,
    rewardMul: (MONOLITH_REWARD_SHARE * blocksForRows(LATE_ROWS)) / (rows * WALL_COLS),
  };
}

/** The open columns of a maze row: `width` cells from `start`, round the cylinder. */
export const mazeOpenCols = (start: number, width: number): number[] => Array.from({ length: width }, (_, k) => (((start + k) % WALL_COLS) + WALL_COLS) % WALL_COLS);

/**
 * MAZE: every block has MAZE_HP_MUL x the tier's HP and a path of open cells winds up the wall (width >= MAZE_MIN_PATH_WIDTH). Seen from the ship
 * (the bottom row first) the path runs straight for a few rows, then shifts one column a row to one side, so two neighbouring rows always
 * share all but one of their open columns and a ship can fly the path without a single shot. Returns the path in `mazePath` (the first open column of every row, row 0 at the top).
 */
function maze(t: number, rank: number): LevelDef {
  const rows = byRank(MAZE_ROWS, rank);
  const width = byRank(MAZE_PATH_WIDTH, rank);
  const [lo, hi] = byRank(MAZE_TURN_ROWS, rank);
  const hp = wholeHp(lateBlockHp(t) * MAZE_HP_MUL);
  const rand = new Mulberry32(t * 7919 + 4242);
  const start: number[] = new Array(rows).fill(0);
  let p = Math.floor(rand.next() * WALL_COLS);
  let r = rows - 1;
  while (r >= 0) {
    // A straight stretch, then a diagonal one to the left or right.
    const straight = 1 + Math.floor(rand.next() * 2);
    for (let k = 0; k < straight && r >= 0; k++, r--) start[r] = p;
    const dir = rand.next() < 0.5 ? -1 : 1;
    const run = lo + Math.floor(rand.next() * (hi - lo + 1));
    for (let k = 0; k < run && r >= 0; k++, r--) { p = (((p + dir) % WALL_COLS) + WALL_COLS) % WALL_COLS; start[r] = p; }
  }
  const cells: (BlockDef | null)[] = new Array(rows * WALL_COLS).fill(null);
  for (let row = 0; row < rows; row++) {
    const open = new Set(mazeOpenCols(start[row], width));
    for (let c = 0; c < WALL_COLS; c++) if (!open.has(c)) cells[row * WALL_COLS + c] = { hp, armor: 0, shield: 0 };
  }
  return {
    ...common(t), rows, cells, name: 'Maze', hint: 'The blocks are far too tough to break. Follow the winding path; a later build can clear it.',
    typeLine: LATE_TYPES.maze.line, mazePath: start, mazeWidth: width,
  };
}

/**
 * DRIFT: rows slide sideways while the wall comes. Every row has DRIFT_GAP_SHARE of its cells empty (gaps to weave through) and the wall
 * holds DRIFT_BLOCKS blocks. Rank 1 slides every row the same way, rank 2 neighbouring rows in opposite
 * ways, rank 3 gives each row its own direction and speed; later ranks repeat the variants faster and heavier.
 */
function drift(t: number, rank: number): LevelDef {
  const variant = byRank(DRIFT_VARIANT, rank);
  const perRow = Math.round(WALL_COLS * (1 - DRIFT_GAP_SHARE));
  const rows = Math.ceil(DRIFT_BLOCKS / perRow);
  const rand = new Mulberry32(t * 6007 + 321);
  const hp = wholeHp(lateBlockHp(t) * byRank(DRIFT_HP_MUL, rank));
  const armorFrac = lateArmorFraction(t), shieldFrac = lateShieldFraction(t);
  const armor = armorValueOf(t), shield = wholeHp(hp * shieldShareOf(t));
  const cells: (BlockDef | null)[] = new Array(rows * WALL_COLS).fill(null);
  for (let r = 0; r < rows; r++) {
    const order = Array.from({ length: WALL_COLS }, (_, c) => c);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand.next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (const c of order.slice(0, perRow)) cells[r * WALL_COLS + c] = { hp, armor: rand.next() < armorFrac ? armor : 0, shield: rand.next() < shieldFrac ? shield : 0 };
  }
  const top = DRIFT_SPEED_BASE * (1 + DRIFT_SPEED_PER_RANK * (rank - 1));
  const sign0 = rand.next() < 0.5 ? -1 : 1;
  const speeds = Array.from({ length: rows }, (_, r) => {
    if (variant === 'same') return sign0 * top;
    if (variant === 'alternate') return (r % 2 === 0 ? sign0 : -sign0) * top;
    return (rand.next() < 0.5 ? -1 : 1) * top * (DRIFT_EACH_SPAN + (1 - DRIFT_EACH_SPAN) * rand.next());
  });
  return {
    ...common(t), rows, cells, name: 'Drift', hint: 'Rows slide sideways: shots and your ship meet the blocks where they are now.',
    typeLine: DRIFT_LINES[variant], drift: { variant, speeds },
  };
}

