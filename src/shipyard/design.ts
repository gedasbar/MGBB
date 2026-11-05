import { CHUNK_BY_ID, ChunkDef, ChunkEffect, rotateRows } from '../data/shipChunks';
import { validateHullLayout } from '../data/hullValidate';
import type { SizeClass } from '../data/hulls';
import {
  CHUNK_CELLS, DESIGN_SLOTS, GENERATOR_COLUMN, PULSE_BASE, PULSE_MIN, PULSE_PER_CELL, SHIPYARD_UNLOCK_RING, SHOT_SPEED_BASE, SIZE_BY_SLOTS, TRAIT_PULSE_FLOOR,
} from './constants';
import { FlyTraits, flyTraitsOf } from './flyTraits';

/**
 * Custom hull rules (chunk 31a, docs/shipyard.md): pure functions, no Pixi, no store.
 * A design is a DESIGN_SLOTS x DESIGN_SLOTS grid of chunk slots (row-major, null = an empty slot = outside the hull). It becomes
 * a normal ROWS layout (compileDesign) that the builder, the compiler and the flight read like any hull.
 * Chunk 31c: the Generator is a fixed cell below the build area (GENERATOR_COLUMN), and every placed chunk has a rotation.
 */
export interface Design {
  slots: (string | null)[];
  /** Chunk 31c: the rotation of each slot's chunk in quarter turns clockwise (0..3), one entry per slot. Absent (a design from before 31c) = all 0. */
  rot?: number[];
  /** Chunk 31b: the player's name for the design (optional, at most DESIGN_NAME_MAX characters; absent = "Custom 1" ...). Not part of the hull rules. */
  name?: string;
}

export const SLOT_COUNT = DESIGN_SLOTS * DESIGN_SLOTS;
/** The build area is GRID x GRID cells; the assembled grid has one more row at the bottom for the generator. */
const GRID = DESIGN_SLOTS * CHUNK_CELLS;

export const emptyDesign = (): Design => ({ slots: new Array<string | null>(SLOT_COUNT).fill(null) });
/** A design from a list of rows of slots: `designOf([[null, 'front_gun'], ...])` (shorter rows and lists are padded with empty slots). */
export function designOf(rows: readonly (readonly (string | null)[])[]): Design {
  const d = emptyDesign();
  rows.forEach((r, y) => r.forEach((id, x) => { if (y < DESIGN_SLOTS && x < DESIGN_SLOTS) d.slots[y * DESIGN_SLOTS + x] = id; }));
  return d;
}
export const slotAt = (d: Design, row: number, col: number): string | null => d.slots[row * DESIGN_SLOTS + col] ?? null;
/** The rotation (0..3 quarter turns clockwise) of a slot's chunk. */
export const rotAt = (d: Design, i: number): number => { const r = d.rot?.[i]; return typeof r === 'number' && Number.isInteger(r) ? ((r % 4) + 4) % 4 : 0; };
/** A copy of a design (slots, rotations, name). */
export function copyDesign(d: Design): Design {
  const out: Design = { slots: [...d.slots] };
  if (d.rot && d.rot.some(r => r !== 0)) out.rot = d.slots.map((_, i) => rotAt(d, i));
  if (d.name) out.name = d.name;
  return out;
}
/** The chunk pattern of slot `i` as placed (rotated), or null for an empty slot. */
export function slotRows(d: Design, i: number): string[] | null {
  const c = CHUNK_BY_ID[d.slots[i] ?? ''];
  return c ? rotateRows(c.rows, rotAt(d, i)) : null;
}
const isEmptyDesign = (d: Design) => d.slots.every(s => s === null);
export { isEmptyDesign };

/** Where the fixed generator sits in the assembled grid (x = GENERATOR_COLUMN, y = the row under the build area). */
export const GENERATOR_CELL = { x: GENERATOR_COLUMN, y: GRID } as const;

/** The assembled cell grid: GRID rows of chunk cells and a last row with the fixed generator (`.` outside). A slot with an unknown chunk id stays empty. */
export function assemble(d: Design): string[] {
  const out = Array.from({ length: GRID + 1 }, () => new Array<string>(GRID).fill('.'));
  for (let sy = 0; sy < DESIGN_SLOTS; sy++) {
    for (let sx = 0; sx < DESIGN_SLOTS; sx++) {
      const rows = slotRows(d, sy * DESIGN_SLOTS + sx);
      if (!rows) continue;
      for (let y = 0; y < CHUNK_CELLS; y++) for (let x = 0; x < CHUNK_CELLS; x++) out[sy * CHUNK_CELLS + y][sx * CHUNK_CELLS + x] = rows[y][x];
    }
  }
  out[GENERATOR_CELL.y][GENERATOR_CELL.x] = 'G';
  return out.map(r => r.join(''));
}

const pos = (sy: number, sx: number) => `row ${sy + 1}, column ${sx + 1}`;
/** The sentence for a missing cell above the generator (the screen and the tests look for it). */
export const NO_CELL_ABOVE_GENERATOR = 'The cell above the generator must be part of the ship';

/**
 * Every mistake of a design as a plain sentence (rows and columns of CHUNK slots, counted from 1, from the top-left); an empty
 * list means the design is valid. Ownership is a separate question (designProblems).
 * Rules (31c): the cell directly above the fixed generator is part of the ship; at least one ejector; every cell and ejector is joined to the generator.
 */
export function validateDesign(d: Design): string[] {
  const out: string[] = [];
  if (d.slots.length !== SLOT_COUNT) return [`A design has ${SLOT_COUNT} slots (${DESIGN_SLOTS} x ${DESIGN_SLOTS}), this one has ${d.slots.length}`];
  const chunks: { sy: number; sx: number; def: ChunkDef; rows: string[] }[] = [];
  for (let sy = 0; sy < DESIGN_SLOTS; sy++) {
    for (let sx = 0; sx < DESIGN_SLOTS; sx++) {
      const id = slotAt(d, sy, sx);
      if (id === null) continue;
      const def = CHUNK_BY_ID[id];
      if (!def) out.push(`The slot at ${pos(sy, sx)} holds "${id}", which is not a chunk`);
      else chunks.push({ sy, sx, def, rows: slotRows(d, sy * DESIGN_SLOTS + sx)! });
    }
  }
  const g = assemble(d);
  const at = (x: number, y: number) => (y >= 0 && y < g.length && x >= 0 && x < GRID ? g[y][x] : '.');
  const aboveOk = at(GENERATOR_CELL.x, GENERATOR_CELL.y - 1) !== '.';
  if (!aboveOk) out.push(NO_CELL_ABOVE_GENERATOR);
  if (!chunks.some(c => c.rows.some(r => r.includes('E')))) out.push('The ship has no gun: add a Front Gun, Twin Gun or Side Gun');
  if (!aboveOk) return Array.from(new Set(out));
  // Everything joined to the generator through cells, across chunk edges too.
  const seen = new Set<number>();
  const stack: [number, number][] = [[GENERATOR_CELL.x, GENERATOR_CELL.y]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (at(x, y) === '.' || seen.has(y * GRID + x)) continue;
    seen.add(y * GRID + x);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  for (const c of chunks) {
    let lost = false;
    for (let y = 0; y < CHUNK_CELLS; y++) for (let x = 0; x < CHUNK_CELLS; x++) {
      if (c.rows[y][x] !== '.' && !seen.has((c.sy * CHUNK_CELLS + y) * GRID + c.sx * CHUNK_CELLS + x)) lost = true;
    }
    if (lost) out.push(`${c.def.name} at ${pos(c.sy, c.sx)} is not connected to the generator`);
  }
  return Array.from(new Set(out));
}

/** The design as the ROWS layout of a hull (empty outer rows and columns trimmed, the generator row kept), or null when it is not valid. */
export function compileDesign(d: Design): string[] | null {
  if (validateDesign(d).length > 0) return null;
  const g = assemble(d);
  const used = (y: number) => g[y].replace(/\./g, '').length > 0;
  let top = 0;
  while (top < g.length - 1 && !used(top)) top++;
  let left = GRID, right = -1;
  for (const row of g) for (let x = 0; x < GRID; x++) if (row[x] !== '.') { left = Math.min(left, x); right = Math.max(right, x); }
  const rows = g.slice(top).map(r => r.slice(left, right + 1));
  // Belt and braces: the compiled layout must pass the checks every normal hull passes.
  return validateHullLayout('Custom hull', rows).length === 0 ? rows : null;
}

// ---------------------------------------------------------------- stats

export interface DesignStats {
  cells: number;
  ejectors: number;
  /** Occupied slots (chunks placed, the Generator included). */
  chunks: number;
  pulsesPerSec: number;
  shotSpeed: number;
  size: SizeClass;
  /** Trait effects that act in the run, not in the hull table. */
  damageMul: number;
  lives: number;
  coresMul: number;
  /** Chunk 32c: the Free Fly trait chunks added up (neutral when none is placed). */
  fly: FlyTraits;
}

export function sizeOfChunks(n: number): SizeClass {
  for (const s of SIZE_BY_SLOTS) if (n <= s.maxSlots) return s.size;
  return 'huge';
}

/** pulses/s before the traits: PULSE_BASE - PULSE_PER_CELL x cells, never below PULSE_MIN. */
export const basePulses = (cells: number) => Math.max(PULSE_MIN, PULSE_BASE - PULSE_PER_CELL * cells);

/** Buildable cells of one chunk (what the fire-rate cost counts; an ejector is not a buildable cell). */
export const chunkCells = (c: { rows: readonly string[] }) => c.rows.join('').split('_').length - 1;
/** The line every chunk shows (chunk 32d): its cells and what they cost in fire rate, e.g. "8 cells · -0.32 pulses/s" (the Corridor: 3 cells, -0.12). */
export const chunkCostLine = (c: { rows: readonly string[] }) => {
  const n = chunkCells(c);
  return `${n} cell${n === 1 ? '' : 's'} · -${(n * PULSE_PER_CELL).toFixed(2)} pulses/s`;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Stats of a valid design (null when it is not valid): the cells, pulse rate, shot speed, size class and the trait effects. */
export function designStats(d: Design): DesignStats | null {
  const rows = compileDesign(d);
  if (!rows) return null;
  const flat = rows.join('');
  const cells = flat.split("_").length - 1;
  const ejectors = flat.split('E').length - 1;
  const effects: (ChunkEffect | undefined)[] = [];
  let pulses = basePulses(cells), speed = SHOT_SPEED_BASE, damage = 1, lives = 0, cores = 1, count = 0;
  for (const id of d.slots) {
    const c = id ? CHUNK_BY_ID[id] : undefined;
    if (!c) continue;
    count++;
    const e = c.effect;
    effects.push(e);
    if (!e) continue;
    pulses += e.pulses ?? 0;
    speed *= 1 + (e.shotSpeed ?? 0);
    damage *= 1 + (e.damage ?? 0);
    lives += e.lives ?? 0;
    cores += e.cores ?? 0;
  }
  return { cells, ejectors, chunks: count, pulsesPerSec: round3(Math.max(TRAIT_PULSE_FLOOR, pulses)), shotSpeed: round3(speed), size: sizeOfChunks(count), damageMul: round3(damage), lives, coresMul: round3(cores), fly: flyTraitsOf(effects) };
}

// ---------------------------------------------------------------- ownership and prices

/** How many of each chunk a design uses. */
export function chunkUsage(d: Design): Record<string, number> {
  const u: Record<string, number> = {};
  for (const id of d.slots) if (id && CHUNK_BY_ID[id]) u[id] = (u[id] ?? 0) + 1;
  return u;
}

/** Chunks a design uses more of than the inventory holds, as plain sentences ("Needs 2 x Corridor, you own 1"). */
export function missingChunks(d: Design, owned: Readonly<Record<string, number>>): string[] {
  const out: string[] = [];
  for (const [id, n] of Object.entries(chunkUsage(d))) {
    const have = owned[id] ?? 0;
    if (have < n) out.push(`Needs ${n} x ${CHUNK_BY_ID[id].name}, you own ${have}`);
  }
  return out;
}

/** Everything standing between a design and flying: its mistakes, then what it needs to own. Empty = flyable. */
export const designProblems = (d: Design, owned: Readonly<Record<string, number>>): string[] => [...validateDesign(d), ...missingChunks(d, owned)];

/** Cores price of the next copy of a chunk when `owned` are already owned: basePrice x growth^owned, whole Cores. */
export function chunkPrice(id: string, owned: number): number {
  const c = CHUNK_BY_ID[id];
  return c ? Math.max(1, Math.round(c.basePrice * Math.pow(c.growth, Math.max(0, owned)))) : Infinity;
}

/** The Shipyard is open once the furthest Frontier ring in any direction reaches SHIPYARD_UNLOCK_RING. */
export const shipyardOpen = (furthestRing: number): boolean => furthestRing >= SHIPYARD_UNLOCK_RING;
