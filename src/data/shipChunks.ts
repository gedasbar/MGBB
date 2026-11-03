import { CHUNK_CELLS } from '../shipyard/constants';

/**
 * SHIP CHUNKS - the building bricks of custom hulls (Shipyard, chunk 31a; rules in shipyard/design.ts, note in docs/shipyard.md).
 *
 * A chunk is a 3x3 pattern, same legend as data/hullLayouts.ts (rows top to bottom):
 *   _  = buildable cell      .  = outside      G = generator (bottom row of its chunk)      E = ejector
 * Two chunks connect where buildable cells touch across their shared edge. An ejector needs nothing buildable above it, and
 * every cell of a chunk should be reachable from its other cells (tests/shipyard.test.ts checks both, in plain words).
 *
 * Prices are in Cores: the n-th copy you own costs  basePrice x growth^(copies already owned). Plain chunks are cheap, guns
 * cost medium, traits are expensive (fit and income model: scripts/shipyard-model.ts, docs/shipyard.md).
 * An `effect` works once per copy placed in a design (pulses add, damage / shot speed / Cores multiply, lives add).
 */
export type ChunkKind = 'plain' | 'generator' | 'gun' | 'trait';

export interface ChunkEffect {
  /** Added to pulses per second. */
  pulses?: number;
  /** Damage change as a fraction (-0.3 = x0.7). */
  damage?: number;
  /** Crashes forgiven per run. */
  lives?: number;
  /** Cores earned change as a fraction (0.1 = +10%). */
  cores?: number;
  /** Shot speed change as a fraction (0.2 = +20%). */
  shotSpeed?: number;
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

/** Default price growth per copy owned. */
export const CHUNK_GROWTH = 1.5;

export const CHUNKS: readonly ChunkDef[] = [
  // ---- plain: cells only
  { id: 'full', name: 'Full', kind: 'plain', basePrice: 25, growth: CHUNK_GROWTH, text: 'A solid 3 x 3 block of cells.',
    rows: ['___', '___', '___'] },
  { id: 'corridor', name: 'Corridor', kind: 'plain', basePrice: 15, growth: CHUNK_GROWTH, text: 'A vertical line of three.',
    rows: ['._.', '._.', '._.'] },
  { id: 'bar', name: 'Bar', kind: 'plain', basePrice: 15, growth: CHUNK_GROWTH, text: 'A horizontal line of three.',
    rows: ['...', '___', '...'] },
  { id: 'corner', name: 'Corner', kind: 'plain', basePrice: 15, growth: CHUNK_GROWTH, text: 'A turn: connects the right and the bottom edge.',
    rows: ['...', '.__', '._.'] },
  { id: 'tjunction', name: 'T-junction', kind: 'plain', basePrice: 20, growth: CHUNK_GROWTH, text: 'Left, right and bottom edges joined.',
    rows: ['...', '___', '._.'] },
  { id: 'cross', name: 'Cross', kind: 'plain', basePrice: 25, growth: CHUNK_GROWTH, text: 'All four edges joined.',
    rows: ['._.', '___', '._.'] },
  { id: 'ring', name: 'Ring', kind: 'plain', basePrice: 30, growth: CHUNK_GROWTH, text: 'Eight cells round a hole: two routes through.',
    rows: ['___', '_._', '___'] },

  // ---- generator: exactly one per ship, in the bottom row of the build area
  { id: 'generator', name: 'Generator', kind: 'generator', basePrice: 60, growth: CHUNK_GROWTH, text: 'The signal source. One per ship, bottom row.',
    rows: ['___', '___', '.G.'] },

  // ---- guns: ejectors
  { id: 'front_gun', name: 'Front Gun', kind: 'gun', basePrice: 250, growth: CHUNK_GROWTH, text: 'One ejector at the top.',
    rows: ['.E.', '._.', '._.'] },
  { id: 'twin_gun', name: 'Twin Gun', kind: 'gun', basePrice: 700, growth: CHUNK_GROWTH, text: 'Two ejectors at the top corners.',
    rows: ['E.E', '___', '._.'] },
  { id: 'side_gun', name: 'Side Gun', kind: 'gun', basePrice: 500, growth: CHUNK_GROWTH, text: 'Ejectors on the left and right: shots leave sideways.',
    rows: ['...', 'E_E', '._.'] },

  // ---- traits: cells plus an effect
  { id: 'wide_open', name: 'Wide Open', kind: 'trait', basePrice: 900, growth: CHUNK_GROWTH, text: '9 cells, but -0.2 pulses/s and -30% damage.',
    rows: ['___', '___', '___'], effect: { pulses: -0.2, damage: -0.3 } },
  { id: 'overdrive', name: 'Overdrive', kind: 'trait', basePrice: 2000, growth: CHUNK_GROWTH, text: '+0.5 pulses/s.',
    rows: ['._.', '._.', '._.'], effect: { pulses: 0.5 } },
  { id: 'extra_life', name: 'Extra Life', kind: 'trait', basePrice: 2500, growth: CHUNK_GROWTH, text: 'One crash forgiven per run.',
    rows: ['._.', '___', '...'], effect: { lives: 1 } },
  { id: 'core_magnet', name: 'Core Magnet', kind: 'trait', basePrice: 1500, growth: CHUNK_GROWTH, text: '+10% Cores earned.',
    rows: ['._.', '___', '._.'], effect: { cores: 0.1 } },
  { id: 'long_barrel', name: 'Long Barrel', kind: 'trait', basePrice: 1600, growth: CHUNK_GROWTH, text: '+20% shot speed.',
    rows: ['__.', '__.', '...'], effect: { shotSpeed: 0.2 } },
];

export const CHUNK_BY_ID: Readonly<Record<string, ChunkDef>> = Object.fromEntries(CHUNKS.map(c => [c.id, c]));

/** Mistakes in the chunk data, in plain words (empty = fine). Used by the tests; run it after editing this file. */
export function validateChunk(c: ChunkDef): string[] {
  const out: string[] = [];
  const bad = (m: string) => out.push(`${c.name}: ${m}`);
  if (c.rows.length !== CHUNK_CELLS) bad(`needs ${CHUNK_CELLS} rows, has ${c.rows.length}`);
  c.rows.forEach((r, y) => {
    if (r.length !== CHUNK_CELLS) bad(`row ${y + 1} has ${r.length} characters, needs ${CHUNK_CELLS}`);
    [...r].forEach((ch, x) => { if (!'._GE'.includes(ch)) bad(`the character "${ch}" at row ${y + 1}, column ${x + 1} is not allowed; use only _ . G E`); });
  });
  const flat = c.rows.join('');
  const count = (ch: string) => flat.split(ch).length - 1;
  if (c.kind === 'generator') {
    if (count('G') !== 1) bad(`needs exactly one G, found ${count('G')}`);
    if (!c.rows[CHUNK_CELLS - 1]?.includes('G')) bad('the G must be on the bottom row');
  } else if (count('G') > 0) bad('only the Generator chunk may have a G');
  if (c.kind === 'gun' && count('E') < 1) bad('a gun needs at least one E');
  if (c.kind !== 'gun' && count('E') > 0) bad('only gun chunks may have an E');
  if (!(c.basePrice > 0)) bad('needs a Cores price above 0');
  if (!(c.growth >= 1)) bad('the price growth per copy cannot be below 1');
  // Every cell reachable from the others inside the chunk; nothing above an ejector.
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
  }
  c.rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'E' && at(x, y - 1) !== '.') bad(`the ejector at row ${y + 1}, column ${x + 1} has a cell above it`); }));
  return out;
}
