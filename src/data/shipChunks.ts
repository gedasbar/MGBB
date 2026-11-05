import { CHUNK_CELLS } from '../shipyard/constants';
import { CORE_MAGNET_RADIUS_PER_COPY } from './coreCrystals';

/**
 * SHIP CHUNKS - the building bricks of custom hulls (Shipyard, chunk 31a; rules in shipyard/design.ts, note in docs/shipyard.md).
 *
 * A chunk is a 3x3 pattern, same legend as data/hullLayouts.ts (rows top to bottom):
 *   _  = buildable cell      .  = outside      E = ejector
 * (No chunk has a G: since chunk 31c the generator is a fixed cell below the build area, shipyard/constants.ts GENERATOR_COLUMN.)
 * Two chunks connect where buildable cells touch across their shared edge. Every cell of a chunk should be reachable from its
 * other cells (tests/shipyard.test.ts checks it, in plain words). A placed chunk can be turned 0 / 90 / 180 / 270 degrees (ejectors turn with it).
 *
 * DESIGN RULES (owner, chunk 31d):
 *  - Every shape exists ONCE, counting rotations (a Bar would just be a Corridor turned 90 degrees, so there is none).
 *  - Plain chunks are priced by the room they give, superlinear in cells (chunk 32d: 250 for three cells up to 1,200 for the eight-cell Ring) and grow 1.5 a copy: a ship needs many of them.
 *  - The full 3x3 block exists only as Wide Open: all that room costs a downside.
 *  - Trait chunks with an upside have small, awkward shapes (1-4 cells, dead ends): you pay in building room as well as Cores.
 *
 * Prices are in Cores: the n-th copy you own costs  basePrice x growth^(copies already owned).
 * An `effect` works once per copy placed in a design (pulses add, damage / shot speed / Cores multiply, lives add).
 */
export type ChunkKind = 'plain' | 'gun' | 'trait';

export interface ChunkEffect {
  /** Added to pulses per second. */
  pulses?: number;
  /** Damage change as a fraction (-0.3 = x0.7). */
  damage?: number;
  /** Crashes forgiven per run. */
  lives?: number;
  /** Cores earned change as a fraction (0.1 = +10%). No chunk uses it since 32e (Core Magnet became `pickup`); kept so the field and old tests still work. */
  cores?: number;
  /** Chunk 32e: Core crystal pickup radius change per copy as a fraction (0.6 = +60%). */
  pickup?: number;
  /** Shot speed change as a fraction (0.2 = +20%). */
  shotSpeed?: number;
  // ---- Free Fly trait effects (chunk 32c). They act in normal Free Fly only: walls and Frontier squares ignore them (see shipyard/flyTraits.ts).
  /** Waves come this much sooner (0.2 = each wave lasts x0.8). */
  waveSpeed?: number;
  /** Enemy HP change as a fraction (0.1 = +10%); bosses are not touched (they have `bossHp`). */
  enemyHp?: number;
  /** Waves last this much longer (0.3 = x1.3). */
  waveLength?: number;
  /** Cores paid when a wave starts, as a fraction (-0.1 = x0.9). */
  wavePay?: number;
  /** Chance a normal wave is skipped (0.1 = 10%); a skipped wave pays nothing, a boss wave is never skipped. */
  waveSkip?: number;
  /** Hull healed per second as a fraction of the max HP, while not hit for REPAIR_IDLE_SECONDS. */
  repair?: number;
  /** Damage change in Free Fly only (-0.15 = x0.85). */
  flyDamage?: number;
  /** Cores a boss pays, as a fraction (0.5 = +50%). */
  bossCores?: number;
  /** Boss HP change as a fraction (0.25 = +25%). */
  bossHp?: number;
}

export interface ChunkDef {
  id: string;
  name: string;
  kind: ChunkKind;
  rows: readonly string[];
  /** Cores for the first copy. */
  basePrice: number;
  /** Price multiplier per copy already owned. */
  growth: number;
  effect?: ChunkEffect;
  /** One short line for the shop (part 2). */
  text: string;
}

/** Price growth per copy owned, by kind. */
export const GROWTH_PLAIN = 1.5;
export const GROWTH_GUN = 1.6;
export const GROWTH_TRAIT = 2.0;
/** Kept for older code that reads one default. */
export const CHUNK_GROWTH = GROWTH_PLAIN;

export const CHUNKS: readonly ChunkDef[] = [
  // ---- plain: cells only, priced by room (superlinear in cells)
  { id: 'corridor', name: 'Corridor', kind: 'plain', basePrice: 250, growth: GROWTH_PLAIN, text: 'A straight line of three.',
    rows: ['._.', '._.', '._.'] },
  { id: 'corner', name: 'Corner', kind: 'plain', basePrice: 250, growth: GROWTH_PLAIN, text: 'A turn of three cells.',
    rows: ['...', '.__', '._.'] },
  { id: 'tjunction', name: 'T-junction', kind: 'plain', basePrice: 400, growth: GROWTH_PLAIN, text: 'Three edges joined.',
    rows: ['...', '___', '._.'] },
  { id: 'cross', name: 'Cross', kind: 'plain', basePrice: 600, growth: GROWTH_PLAIN, text: 'All four edges joined.',
    rows: ['._.', '___', '._.'] },
  { id: 'ring', name: 'Ring', kind: 'plain', basePrice: 1200, growth: GROWTH_PLAIN, text: 'Eight cells round a hole: two routes through.',
    rows: ['___', '_._', '___'] },

  // ---- guns: ejectors
  { id: 'front_gun', name: 'Front Gun', kind: 'gun', basePrice: 700, growth: GROWTH_GUN, text: 'One ejector at the end of a line.',
    rows: ['.E.', '._.', '._.'] },
  { id: 'side_gun', name: 'Side Gun', kind: 'gun', basePrice: 1200, growth: GROWTH_GUN, text: 'Two ejectors facing opposite sides.',
    rows: ['...', 'E_E', '._.'] },
  { id: 'twin_gun', name: 'Twin Gun', kind: 'gun', basePrice: 1600, growth: GROWTH_GUN, text: 'Two ejectors side by side.',
    rows: ['E.E', '___', '._.'] },

  // ---- traits: an effect, paid for in Cores AND in building room
  { id: 'wide_open', name: 'Wide Open', kind: 'trait', basePrice: 2000, growth: GROWTH_TRAIT, text: '9 cells of room, but -0.2 pulses/s and -30% damage.',
    rows: ['___', '___', '___'], effect: { pulses: -0.2, damage: -0.3 } },
  { id: 'long_barrel', name: 'Long Barrel', kind: 'trait', basePrice: 2500, growth: GROWTH_TRAIT, text: '+20% shot speed.',
    rows: ['__.', '__.', '...'], effect: { shotSpeed: 0.2 } },
  { id: 'core_magnet', name: 'Core Magnet', kind: 'trait', basePrice: 2500, growth: GROWTH_TRAIT, text: '+60% Core crystal pickup radius per copy.',
    rows: ['__.', '...', '...'], effect: { pickup: CORE_MAGNET_RADIUS_PER_COPY } },
  { id: 'overdrive', name: 'Overdrive', kind: 'trait', basePrice: 4000, growth: GROWTH_TRAIT, text: '+0.5 pulses/s.',
    rows: ['._.', '._.', '...'], effect: { pulses: 0.5 } },
  { id: 'extra_life', name: 'Extra Life', kind: 'trait', basePrice: 5000, growth: GROWTH_TRAIT, text: 'One crash forgiven per run.',
    rows: ['._.', '...', '...'], effect: { lives: 1 } },

  // ---- Free Fly traits (chunk 32c): an upside AND a downside, Free Fly only (walls and the Frontier ignore them)
  { id: 'longer_waves', name: 'Longer Waves', kind: 'trait', basePrice: 2000, growth: GROWTH_TRAIT, text: 'Free Fly only: waves last 30% longer, but pay -10% Cores.',
    rows: ['__.', '_..', '...'], effect: { waveLength: 0.3, wavePay: -0.1 } },
  { id: 'boss_bounty', name: 'Boss Bounty', kind: 'trait', basePrice: 3000, growth: GROWTH_TRAIT, text: 'Free Fly only: bosses pay +50% Cores, but have +25% HP.',
    rows: ['___', '.._', '...'], effect: { bossCores: 0.5, bossHp: 0.25 } },
  { id: 'faster_waves', name: 'Faster Waves', kind: 'trait', basePrice: 4000, growth: GROWTH_TRAIT, text: 'Free Fly only: waves come 20% sooner, but enemies have +10% HP.',
    rows: ['_..', '...', '...'], effect: { waveSpeed: 0.2, enemyHp: 0.1 } },
  { id: 'wave_skipper', name: 'Wave Skipper', kind: 'trait', basePrice: 4500, growth: GROWTH_TRAIT, text: 'Free Fly only: 10% of normal waves are skipped, and a skipped wave pays nothing.',
    rows: ['_..', '_..', '...'], effect: { waveSkip: 0.1 } },
  { id: 'repair_bay', name: 'Repair Bay', kind: 'trait', basePrice: 5500, growth: GROWTH_TRAIT, text: 'Free Fly only: heals 2% hull a second when not hit for 2 s, but -15% damage.',
    rows: ['__.', '.__', '...'], effect: { repair: 0.02, flyDamage: -0.15 } },
];

/** Chunk ids removed in chunk 31d (duplicates). Owned copies are refunded in Cores and leave saved designs (econ/migrate.ts). */
export const REMOVED_CHUNKS: readonly string[] = ['full', 'bar'];

export const CHUNK_BY_ID: Readonly<Record<string, ChunkDef>> = Object.fromEntries(CHUNKS.map(c => [c.id, c]));

/** Mistakes in the chunk data, in plain words (empty = fine). Used by the tests; run it after editing this file. */
export function validateChunk(c: ChunkDef): string[] {
  const out: string[] = [];
  const bad = (m: string) => out.push(`${c.name}: ${m}`);
  if (c.rows.length !== CHUNK_CELLS) bad(`needs ${CHUNK_CELLS} rows, has ${c.rows.length}`);
  c.rows.forEach((r, y) => {
    if (r.length !== CHUNK_CELLS) bad(`row ${y + 1} has ${r.length} characters, needs ${CHUNK_CELLS}`);
    [...r].forEach((ch, x) => { if (!'._E'.includes(ch)) bad(`the character "${ch}" at row ${y + 1}, column ${x + 1} is not allowed; use only _ . E`); });
  });
  const flat = c.rows.join('');
  const count = (ch: string) => flat.split(ch).length - 1;
  if (count('G') > 0) bad('a chunk has no G: the generator is a fixed cell below the build area');
  if (c.kind === 'gun' && count('E') < 1) bad('a gun needs at least one E');
  if (c.kind !== 'gun' && count('E') > 0) bad('only gun chunks may have an E');
  if (!(c.basePrice > 0)) bad('needs a Cores price above 0');
  if (!(c.growth >= 1)) bad('the price growth per copy cannot be below 1');
  // Every cell reachable from the others inside the chunk (an ejector may have cells above it since 31c: it fires out of the side opposite its entry).
  const at = (x: number, y: number) => (y >= 0 && y < c.rows.length && x >= 0 && x < (c.rows[y]?.length ?? 0) ? c.rows[y][x] : '.');
  const cells: [number, number][] = [];
  c.rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') cells.push([x, y]); }));
  if (cells.length === 0) bad('has no cells');
  else {
    const seen = new Set<string>([`${cells[0][0]},${cells[0][1]}`]);
    const stack: [number, number][] = [cells[0]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        if (at(nx, ny) !== '.' && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); stack.push([nx, ny]); }
      }
    }
    if (seen.size !== cells.length) bad('its cells are not all joined to each other');
    // A chunk must reach at least one edge of its 3x3, or nothing can ever connect to it.
    if (!cells.some(([x, y]) => x === 0 || y === 0 || x === CHUNK_CELLS - 1 || y === CHUNK_CELLS - 1)) bad('no cell touches an edge, so it can never connect to the rest of the ship');
  }
  return out;
}

/** Shapes that are the same pattern up to rotation (plain words; empty = every shape is unique). Used by the tests. */
export function duplicateShapes(chunks: readonly ChunkDef[] = CHUNKS): string[] {
  const out: string[] = [];
  const key = (rows: readonly string[]) => [0, 1, 2, 3].map(q => rotateRows(rows, q).join('/')).sort()[0];
  const seen = new Map<string, string>();
  for (const c of chunks) {
    const k = key(c.rows);
    const prev = seen.get(k);
    if (prev) out.push(`${c.name} has the same shape as ${prev} (counting rotations)`);
    else seen.set(k, c.name);
  }
  return out;
}

/** A pattern turned clockwise by `quarters` quarter turns (0..3; any integer is taken modulo 4). Ejectors and cells move together: new[r][c] = old[n-1-c][r] per turn. */
export function rotateRows(rows: readonly string[], quarters: number): string[] {
  let cur = [...rows];
  const turns = ((Math.round(quarters) % 4) + 4) % 4;
  for (let t = 0; t < turns; t++) {
    const n = cur.length;
    cur = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => cur[n - 1 - c][r]).join(''));
  }
  return cur;
}
