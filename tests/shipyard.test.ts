import { describe, it, expect, beforeEach } from 'vitest';
import { CHUNKS, CHUNK_BY_ID, validateChunk, ChunkDef } from '../src/data/shipChunks';
import {
  assemble, basePulses, chunkPrice, chunkUsage, compileDesign, copyDesign, designOf, designProblems, designStats, emptyDesign, GENERATOR_CELL, missingChunks, NO_CELL_ABOVE_GENERATOR,
  rotAt, shipyardOpen, sizeOfChunks, slotRows, validateDesign, Design,
} from '../src/shipyard/design';
import { GENERATOR_COLUMN } from '../src/shipyard/constants';
import { rotateRows } from '../src/data/shipChunks';
import { withHull } from '../src/game/gridUtils';
import { coresForWave, encounterCores, encounterCoresPerBlock, milestoneCores, waveStartCores } from '../src/shipyard/cores';
import { buyChunk, cleanRot, defaultShipyard, generatorRefund, sanitizeShipyard, setDesign } from '../src/shipyard/state';
import { applyHullTraits, flightProblems, registerCustomHulls } from '../src/shipyard/registry';
import { CURRENCY_CORES_NAME, MAX_DESIGNS, SHIPYARD_UNLOCK_RING } from '../src/shipyard/constants';
import { validateHullLayout } from '../src/data/hullValidate';
import { defaultProgress, loadProgress, ProgressStore, PROGRESS_VERSION, serializeProgress } from '../src/econ/progress';
import { addCores, ownAllChunks, saveSampleDesign } from '../src/debug/cheats';
import { getWorld, sqKey } from '../src/frontier/world';
import { SQ_CLEARED } from '../src/frontier/state';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { customHullInfo, fireRateMul, hitRadiusOf, shotSpeedMul, sizeClassOf } from '../src/data/hulls';
import { compile } from '../src/engine/compiler';
import { World } from '../src/game/world';
import { flyRunResult } from '../src/game/runEnd';
import { neutralModifiers } from '../src/captains/modifiers';
import { hullRows } from '../src/builder/hullPickerLogic';
import { checkImportString, exportSaveString } from '../src/econ/saveTransfer';
import { WAVE_TIME } from '../src/data/waves';
import { PointerState } from '../src/input';
import { CONFIG } from '../src/config';

const DT = 1 / 60;
const idle = (): PointerState => ({ x: 0, y: 0, active: false, type: 'mouse', seen: false });

/**
 * Chunks stacked in the first column (slot column 0), the last one on the bottom row (row 4). The fixed generator (31c) sits under the bottom row at cell column 2 of 12,
 * i.e. under the MIDDLE cell of the first slot column, so the chunk on the bottom row of that column needs a cell at its bottom middle (Full, Corridor and Cross have one).
 */
const stack = (...ids: string[]) => designOf([...new Array(4 - ids.length).fill([]), ...ids.map(id => [id])]);
/** A Front Gun over a Full chunk: a small valid ship (the Full chunk sits right above the fixed generator). */
const SMALL = () => stack('front_gun', 'full');
/** Nine chunks: two guns on corridors over a row of three Crosses, an Overdrive stub and a Full chunk over the generator. */
const MEDIUM = () => designOf([
  ['front_gun', null, 'front_gun'],
  ['corridor', null, 'corridor'],
  ['cross', 'cross', 'cross'],
  ['full', 'overdrive', null],
]);
/** SMALL with one more chunk, in the first empty slot (and the first rotation) where the ship stays valid; null when nowhere fits. */
function attach(id: string, base: Design = SMALL()): Design | null {
  for (let i = 0; i < 16; i++) {
    if (base.slots[i] !== null) continue;
    for (let r = 0; r < 4; r++) {
      const d: Design = { slots: [...base.slots], rot: new Array(16).fill(0) };
      d.slots[i] = id; d.rot![i] = r;
      if (validateDesign(d).length === 0) return d;
    }
  }
  return null;
}

/** A store whose furthest Frontier ring is exactly `ring` (one cleared square, the first that is not a hole; the Shipyard opens at 150). */
function storeAtRing(ring: number): ProgressStore {
  const s = new ProgressStore(null);
  reachRing(s, ring);
  return s;
}
function reachRing(s: ProgressStore, ring: number) {
  const w = getWorld(s.data.frontier.seed);
  for (let y = 0; y < 50; y++) if (!w.isHole(ring, y)) { s.data.frontier.sq[sqKey(ring, y)] = SQ_CLEARED; break; }
  s.commit();
}

describe('chunk data', () => {
  it('every chunk passes the plain-words validator', () => {
    for (const c of CHUNKS) expect(validateChunk(c), c.id).toEqual([]);
  });

  it('the starting set is all there: 7 plain, 3 guns, 5 traits, and no Generator chunk (31c)', () => {
    const kinds = (k: string) => CHUNKS.filter(c => c.kind === k).length;
    expect([kinds('plain'), kinds('gun'), kinds('trait')]).toEqual([7, 3, 5]);
    expect(CHUNK_BY_ID.generator).toBeUndefined();
    expect(CHUNKS.some(c => c.rows.join('').includes('G'))).toBe(false);
    expect(CHUNK_BY_ID.ring.rows.join('').split('_').length - 1).toBe(8);
    expect(CHUNK_BY_ID.wide_open.rows.join('').split('_').length - 1).toBe(9);
    expect(CHUNK_BY_ID.overdrive.rows.join('').split('_').length - 1).toBe(3);
    expect(CHUNK_BY_ID.extra_life.rows.join('').split('_').length - 1).toBe(4);
    expect(CHUNK_BY_ID.core_magnet.rows.join('').split('_').length - 1).toBe(5);
    expect(CHUNK_BY_ID.long_barrel.rows.join('').split('_').length - 1).toBe(4);
    expect(CHUNK_BY_ID.twin_gun.rows.join('').split('E').length - 1).toBe(2);
    expect(CHUNK_BY_ID.side_gun.rows[1][0]).toBe('E');
    expect(CHUNK_BY_ID.side_gun.rows[1][2]).toBe('E');
  });

  it('the validator explains a bad chunk', () => {
    // 31c: a cell above an ejector is fine now (the chunk can be rotated, and an ejector fires out of the side opposite its entry)
    expect(validateChunk({ ...CHUNK_BY_ID.front_gun, rows: ['.E.', '.E.', '._.'] })).toEqual([]);
    const split: ChunkDef = { ...CHUNK_BY_ID.full, rows: ['_._', '...', '_._'] }; // cells not joined
    expect(validateChunk(split).join(' ')).toContain('not all joined');
    expect(validateChunk({ ...CHUNK_BY_ID.full, rows: ['___', '_G_', '___'] }).join(' ')).toContain('no G');
    expect(validateChunk({ ...CHUNK_BY_ID.full, basePrice: 0 }).join(' ')).toContain('price above 0');
  });

  it('plain chunks are cheap, guns medium, traits expensive', () => {
    const max = (k: string) => Math.max(...CHUNKS.filter(c => c.kind === k).map(c => c.basePrice));
    const min = (k: string) => Math.min(...CHUNKS.filter(c => c.kind === k).map(c => c.basePrice));
    expect(max('plain')).toBeLessThan(min('gun'));
    expect(max('gun')).toBeLessThan(min('trait'));
    expect(CHUNKS.every(c => c.growth === 1.5)).toBe(true);
  });
});

describe('design validity, every rule with its plain error', () => {
  it('a Full chunk over the fixed generator with a gun on top is valid', () => {
    expect(validateDesign(SMALL())).toEqual([]);
    expect(validateDesign(MEDIUM())).toEqual([]);
  });

  it('the fixed generator: the cell above it must be part of the ship', () => {
    // A Bar in the bottom row of the generator column has no cell at its bottom middle: nothing sits above the generator.
    const d = stack('front_gun', 'bar');
    expect(validateDesign(d)).toContain('The cell above the generator must be part of the ship');
    expect(compileDesign(d)).toBeNull();
    // The same design one slot to the right does not help either; the generator is where it is.
    expect(validateDesign(designOf([[], [], [null, 'front_gun'], [null, 'full']]))).toContain(NO_CELL_ABOVE_GENERATOR);
    // Full gives the cell; so does a chunk turned so that a cell lands there.
    expect(validateDesign(stack('front_gun', 'full'))).toEqual([]);
    expect(GENERATOR_COLUMN).toBe(1); // column 2 of 12, the middle of the first bottom chunk
  });

  it('the generator is a fixed row of the assembled grid, never a chunk', () => {
    const g = assemble(SMALL());
    expect(g).toHaveLength(13);
    expect(g[12]).toBe('.G..........');
    expect(g.slice(0, 12).some(r => r.includes('G'))).toBe(false);
    expect(GENERATOR_CELL).toEqual({ x: 1, y: 12 });
  });

  it('at least one ejector', () => {
    expect(validateDesign(stack('full'))).toContain('The ship has no gun: add a Front Gun, Twin Gun or Side Gun');
  });

  it('an ejector may sit anywhere a signal reaches: cells above it are fine (31c)', () => {
    // A Front Gun with a Full chunk ABOVE it: the old "nothing above an ejector" rule is gone.
    const d = designOf([[], ['full'], ['front_gun'], ['full']]);
    expect(validateDesign(d)).toEqual([]);
    expect(compileDesign(d)).not.toBeNull();
  });

  it('every gun and cell must be connected to the generator, across chunk edges, with the chunk named', () => {
    // A Twin Gun at row 2, column 2 hangs in the air: nothing under it joins the generator.
    const d = designOf([[], ['front_gun', 'twin_gun'], ['corridor'], ['full']]);
    expect(validateDesign(d)).toEqual(['Twin Gun at row 2, column 2 is not connected to the generator']);
  });

  it('a chunk that does not touch the rest across an edge is reported', () => {
    // A Corner (cells on its right and bottom edges only) right of the Full chunk: nothing of it touches the Full chunk's edge.
    const d = designOf([[], [], ['front_gun'], ['full', 'corner']]);
    expect(validateDesign(d)).toEqual(['Corner at row 4, column 2 is not connected to the generator']);
  });

  it('a Bar to the right of the Full chunk connects through the touching edge cells', () => {
    const d = designOf([[], [], ['front_gun'], ['full', 'bar']]);
    expect(validateDesign(d)).toEqual([]);
  });

  it('an unknown chunk id and a wrong slot count are explained', () => {
    const d = SMALL();
    d.slots[0] = 'warp_drive';
    expect(validateDesign(d)).toContain('The slot at row 1, column 1 holds "warp_drive", which is not a chunk');
    expect(validateDesign({ slots: ['full'] })[0]).toContain('16 slots');
    // The old Generator chunk id is simply "not a chunk" now.
    expect(validateDesign(designOf([[], [], ['front_gun'], ['generator']]))).toContain('The slot at row 4, column 1 holds "generator", which is not a chunk');
  });

  it('an empty design reports what is missing, never throws', () => {
    expect(validateDesign(emptyDesign()).length).toBeGreaterThan(0);
    expect(compileDesign(emptyDesign())).toBeNull();
    expect(designStats(emptyDesign())).toBeNull();
  });
});

describe('rotating a chunk (31c)', () => {
  it('rotateRows turns the whole pattern clockwise, ejectors included; four turns are the identity', () => {
    const twin = CHUNK_BY_ID.twin_gun.rows; // E.E / ___ / ._.
    expect(rotateRows(twin, 0)).toEqual(['E.E', '___', '._.']);
    expect(rotateRows(twin, 1)).toEqual(['._E', '__.', '._E']);
    expect(rotateRows(twin, 2)).toEqual(['._.', '___', 'E.E']);
    expect(rotateRows(twin, 3)).toEqual(['E_.', '.__', 'E_.']);
    expect(rotateRows(twin, 4)).toEqual([...twin]);
    expect(rotateRows(twin, -1)).toEqual(rotateRows(twin, 3));
    for (const c of CHUNKS) for (let r = 0; r < 4; r++) {
      const flat = rotateRows(c.rows, r).join('');
      expect(flat.split('E').length, c.id).toBe(c.rows.join('').split('E').length); // as many ejectors
      expect(flat.split('_').length, c.id).toBe(c.rows.join('').split('_').length); // as many cells
    }
  });

  it('a Front Gun turned 90 degrees has its ejector on the right edge, and the design assembles it there', () => {
    const d = designOf([[], [], ['front_gun'], ['full']]);
    d.rot = new Array(16).fill(0); d.rot[8] = 1;
    expect(slotRows(d, 8)).toEqual(['...', '__E', '...']);
    expect(assemble(d)[7]).toBe('__E.........'); // the ejector is at the right edge of the slot (cell column 9 of 12), row 8; the cells left of it
  });

  it('rotation changes which cells connect: a Corner joins the Full chunk below only when turned', () => {
    // Corner at rotation 0 has cells right + bottom (centre, right, bottom). Under a Front Gun's cell column it joins; turned 180 it has cells left + top.
    const mk = (r: number) => { const d = designOf([[], [], ['front_gun'], ['full', 'corner']]); d.rot = new Array(16).fill(0); d.rot[13] = r; return d; };
    expect(validateDesign(mk(0))).toContain('Corner at row 4, column 2 is not connected to the generator');
    expect(validateDesign(mk(2))).toEqual([]); // turned: its left edge cell touches the Full chunk
  });

  it('the compiled layout follows the rotation (ejector positions move)', () => {
    const d = designOf([[], [], ['front_gun'], ['full']]);
    const plain = compileDesign(d)!;
    expect(plain[0]).toBe('.E.');
    d.rot = new Array(16).fill(0); d.rot[8] = 2; // the gun turned upside down: its ejector is on its bottom row, inside the ship
    const flipped = compileDesign(d)!;
    expect(flipped).not.toEqual(plain);
    expect(flipped.join('').split('E').length - 1).toBe(1);
    expect(validateHullLayout('turned', flipped)).toEqual([]);
  });

  it('rotation is stored in the design, copied with it and read as 0 when absent', () => {
    const d = SMALL();
    expect([0, 1, 2, 3].map(i => rotAt(d, i))).toEqual([0, 0, 0, 0]); // no rot list: all 0
    d.rot = new Array(16).fill(0); d.rot[8] = 3;
    expect(rotAt(d, 8)).toBe(3);
    expect(copyDesign(d).rot![8]).toBe(3);
    expect(rotAt({ slots: d.slots, rot: [5, -1] }, 0)).toBe(1); // modulo 4
    expect(rotAt({ slots: d.slots, rot: [5, -1] }, 1)).toBe(3);
  });
});

describe('compiling a design into the ROWS layout of a hull', () => {
  it('the small design: a 3-wide hull with the generator on the bottom row at its fixed column', () => {
    expect(compileDesign(SMALL())).toEqual([
      '.E.', '._.', '._.',
      '___', '___', '___',
      '.G.',
    ]);
  });

  it('the assembled grid has the chunks where the slots say', () => {
    const g = assemble(SMALL());
    expect(g.every(r => r.length === 12)).toBe(true);
    expect(g[12]).toBe('.G..........');
    expect(g[6]).toBe('.E..........');
    expect(g[0]).toBe('............');
  });

  it('a compiled layout passes the validator every normal hull passes', () => {
    for (const d of [SMALL(), MEDIUM()]) expect(validateHullLayout('custom', compileDesign(d)!)).toEqual([]);
  });

  it('an invalid design does not compile', () => {
    expect(compileDesign(stack('front_gun', 'full'))).not.toBeNull();
    expect(compileDesign(stack('full'))).toBeNull(); // no gun
    expect(compileDesign(stack('front_gun', 'bar'))).toBeNull(); // nothing above the generator
  });

  it('the registered hull builds a grid the circuit compiler reads with no special case', () => {
    const store = storeAtRing(SHIPYARD_UNLOCK_RING);
    ownAllChunks(store, 1);
    saveSampleDesign(store);
    expect(HULL_BUILDERS.custom1).toBeTypeOf('function');
    const grid = HULL_BUILDERS.custom1();
    expect(grid.hullId).toBe('custom1');
    const out = compile(grid, {});
    expect(out.recipes).toHaveLength(1); // one ejector, reached by the generator's signal through the empty cells
    expect(out.recipes[0].packet.damage).toBeGreaterThan(0);
  });

  it('a Front Gun over the Full chunk is straight above the generator (column 2 of 12): one recipe with no block', () => {
    expect(compile(withHull('t', compileDesign(SMALL())!), {}).recipes).toHaveLength(1);
  });
});

describe('stats', () => {
  it('pulses/s = 5.0 - 0.025 x cells, never below 1.5', () => {
    expect(basePulses(0)).toBe(5);
    expect(basePulses(20)).toBeCloseTo(4.5, 9);
    expect(basePulses(80)).toBeCloseTo(3, 9);
    expect(basePulses(140)).toBe(1.5); // 5 - 3.5 = 1.5 exactly
    expect(basePulses(300)).toBe(1.5);
  });

  it('the small design: cells counted from the compiled layout', () => {
    const s = designStats(SMALL())!;
    // front gun 2 cells (the E is not a cell), Full 9: 11 (the fixed generator's G is not a cell)
    expect(s.cells).toBe(11);
    expect(s.ejectors).toBe(1);
    expect(s.pulsesPerSec).toBeCloseTo(5 - 0.025 * 11, 9);
    expect(s.shotSpeed).toBe(1);
    expect(s.size).toBe('small'); // 2 chunks
    expect(s.chunks).toBe(2);
  });

  it('traits come after the formula: Overdrive +0.5, Wide Open -0.2 and x0.7 damage, Long Barrel +20% speed, Core Magnet +10%, Extra Life', () => {
    const base = designStats(SMALL())!;
    // A trait chunk goes in the first free slot (and rotation) where the ship stays valid.
    const withTrait = (id: string) => designStats(attach(id)!)!;
    const od = withTrait('overdrive');
    expect(od.pulsesPerSec).toBeCloseTo(basePulses(od.cells) + 0.5, 9);
    const wo = withTrait('wide_open');
    expect(wo.pulsesPerSec).toBeCloseTo(basePulses(wo.cells) - 0.2, 9);
    expect(wo.damageMul).toBe(0.7);
    expect(withTrait('long_barrel').shotSpeed).toBe(1.2);
    expect(withTrait('core_magnet').coresMul).toBe(1.1);
    expect(withTrait('extra_life').lives).toBe(1);
    expect(base.damageMul).toBe(1);
    expect(base.lives).toBe(0);
  });

  it('size class from the occupied chunks: 1-2 small, 3-5 medium, 6-9 big, 10+ huge', () => {
    expect([1, 2, 3, 5, 6, 9, 10, 16].map(sizeOfChunks)).toEqual(['small', 'small', 'medium', 'medium', 'big', 'big', 'huge', 'huge']);
    // A gun over a Full chunk is two chunks: small (and the hit radius is the small one).
    expect(designStats(stack('front_gun', 'full'))!.size).toBe('small');
  });

  it('registered custom hulls feed the normal stat lookups (rate, speed, size, hit radius)', () => {
    const store = storeAtRing(SHIPYARD_UNLOCK_RING);
    ownAllChunks(store, 3);
    store.setDesign(1, MEDIUM());
    const st = designStats(MEDIUM())!;
    expect(store.data.ownedHulls).toContain('custom2');
    expect(fireRateMul('custom2') * CONFIG.PULSE.BASE_RATE).toBeCloseTo(st.pulsesPerSec, 9);
    expect(shotSpeedMul('custom2')).toBe(st.shotSpeed);
    expect(sizeClassOf('custom2')).toBe(st.size);
    expect(st.size).toBe('big'); // nine chunks
    expect(hitRadiusOf('custom2')).toBe(10);
  });

  it('three example designs next to the Zenith (printed for the report)', () => {
    const maxed = designOf([
      ['front_gun', 'twin_gun', 'twin_gun', 'front_gun'],
      ['full', 'overdrive', 'overdrive', 'full'],
      ['full', 'full', 'full', 'full'],
      ['full', 'full', 'full', 'overdrive'],
    ]);
    const rows = [['small', stack('front_gun', 'full')], ['medium', MEDIUM()], ['maxed', maxed]] as const;
    for (const [name, d] of rows) {
      const s = designStats(d);
      expect(s, name).not.toBeNull();
      // eslint-disable-next-line no-console
      console.log(`${name}: ${s!.chunks} chunks, ${s!.cells} cells, ${s!.ejectors} ejectors, ${s!.pulsesPerSec}/s, speed x${s!.shotSpeed}, ${s!.size}`);
    }
  });
});

describe('ownership and prices', () => {
  it('the n-th copy costs base x 1.5^(copies owned)', () => {
    expect(chunkPrice('full', 0)).toBe(25);
    expect(chunkPrice('full', 1)).toBe(38); // 37.5 rounds up
    expect(chunkPrice('full', 2)).toBe(56);
    expect(chunkPrice('overdrive', 3)).toBe(Math.round(2000 * 1.5 ** 3));
    expect(chunkPrice('nope', 0)).toBe(Infinity);
  });

  it('buying takes Cores and adds a copy; not enough Cores changes nothing', () => {
    const p = defaultShipyard();
    p.cores = 40;
    expect(buyChunk(p, 'full', SHIPYARD_UNLOCK_RING)).toEqual({ ok: true, price: 25 });
    expect(p.cores).toBe(15);
    expect(p.chunks.full).toBe(1);
    const r = buyChunk(p, 'full', SHIPYARD_UNLOCK_RING); // 38 > 15
    expect(r.ok).toBe(false);
    expect(p.cores).toBe(15);
    expect(p.chunks.full).toBe(1);
    expect(buyChunk(p, 'warp_drive', SHIPYARD_UNLOCK_RING)).toEqual({ ok: false, error: 'Not for sale' });
  });

  it('the Shipyard is closed below ring 150: buying and saving a design are refused', () => {
    const p = defaultShipyard();
    p.cores = 5000;
    const closed = `The Shipyard opens at Frontier ring ${SHIPYARD_UNLOCK_RING}`;
    expect(buyChunk(p, 'full', SHIPYARD_UNLOCK_RING - 1)).toEqual({ ok: false, error: closed });
    expect(setDesign(p, 0, SMALL(), SHIPYARD_UNLOCK_RING - 1)).toEqual({ ok: false, error: closed });
    expect(p.cores).toBe(5000);
  });

  it('a design uses one copy per placed chunk; missing copies are named', () => {
    expect(chunkUsage(MEDIUM())).toEqual({ front_gun: 2, corridor: 2, cross: 3, overdrive: 1, full: 1 });
    expect(missingChunks(MEDIUM(), { front_gun: 2, corridor: 1, cross: 3, overdrive: 1, full: 1 })).toEqual(['Needs 2 x Corridor, you own 1']);
    expect(designProblems(MEDIUM(), {})).toContain('Needs 1 x Full, you own 0');
    expect(designProblems(MEDIUM(), { front_gun: 2, corridor: 2, cross: 3, overdrive: 1, full: 1 })).toEqual([]);
  });

  it('only 3 design slots; an empty design clears the slot', () => {
    const p = defaultShipyard();
    expect(p.designs).toHaveLength(MAX_DESIGNS);
    expect(setDesign(p, MAX_DESIGNS, SMALL(), 200).ok).toBe(false);
    expect(setDesign(p, -1, SMALL(), 200).ok).toBe(false);
    expect(setDesign(p, 0, SMALL(), 200).ok).toBe(true);
    expect(p.designs[0]).toEqual(SMALL());
    expect(setDesign(p, 0, emptyDesign(), 200).ok).toBe(true);
    expect(p.designs[0]).toBeNull();
  });

  it('a half-finished design is saved but does not fly; a valid fully owned one does', () => {
    const view = { chunks: { front_gun: 1, full: 1, corridor: 1 } as Record<string, number>, designs: [SMALL(), stack('corridor'), null] };
    expect(flightProblems(view, 0, 150)).toEqual([]);
    expect(flightProblems(view, 1, 150).length).toBeGreaterThan(0);
    expect(flightProblems(view, 2, 150)).toEqual(['This slot has no design']);
    expect(flightProblems({ ...view, chunks: { corridor: 1 } }, 0, 150)).toContain('Needs 1 x Front Gun, you own 0');
    expect(flightProblems(view, 0, 149)).toEqual(['The Shipyard is not open yet']);
  });
});

describe('unlock at ring 150 and the hull picker', () => {
  it('shipyardOpen is a threshold on the furthest ring', () => {
    expect(shipyardOpen(149)).toBe(false);
    expect(shipyardOpen(150)).toBe(true);
    expect(SHIPYARD_UNLOCK_RING).toBe(150);
  });

  it('through the store: ring 149 is closed, 150 opens it, and the valid owned design becomes Custom 1 in the hull picker', () => {
    const s = storeAtRing(SHIPYARD_UNLOCK_RING - 1);
    expect(s.shipyardOpen).toBe(false);
    ownAllChunks(s, 1);
    expect(s.setDesign(0, SMALL()).ok).toBe(false);
    reachRing(s, SHIPYARD_UNLOCK_RING);
    expect(s.shipyardOpen).toBe(true);
    expect(s.setDesign(0, SMALL()).ok).toBe(true);
    expect(s.data.ownedHulls).toContain('custom1');
    const rows = hullRows(s.data.ownedHulls, 'custom1', 0);
    const row = rows.find(r => r.id === 'custom1')!;
    expect(row.name).toBe('Custom 1');
    expect(row.owned && row.current).toBe(true);
    expect(row.ejectors).toBe(1);
    expect(row.cells).toBe(11);
  });

  it('a design that stops being flyable disappears from the hull picker and from ownedHulls', () => {
    const s = storeAtRing(SHIPYARD_UNLOCK_RING);
    ownAllChunks(s, 1);
    s.setDesign(0, SMALL());
    expect(s.data.ownedHulls).toContain('custom1');
    s.data.chunks.front_gun = 0; // the chunk is not owned any more
    s.commit();
    expect(s.data.ownedHulls).not.toContain('custom1');
    expect(HULL_BUILDERS.custom1).toBeUndefined();
    expect(hullRows(s.data.ownedHulls, 'dart', 0).some(r => r.id === 'custom1')).toBe(false);
    expect(customHullInfo('custom1')).toBeUndefined();
  });

  it('Cores accumulate before the unlock (the bank is there when it opens)', () => {
    const s = new ProgressStore(null);
    s.recordRun({ credits: 10, cores: 60, kills: 3, time: 100, tier: 3, wave: 3 });
    expect(s.data.cores).toBe(60);
    expect(s.shipyardOpen).toBe(false);
    reachRing(s, SHIPYARD_UNLOCK_RING);
    expect(s.buyChunk('full').ok).toBe(true);
    expect(s.data.cores).toBe(60 - 25);
  });
});

describe('earning Cores (Free Fly only)', () => {
  it('per wave: 2 x 1.08^(wave-2), none for wave 1; milestones add 2 x wave, every time', () => {
    expect([1, 2, 3, 10, 20, 30, 50].map(coresForWave)).toEqual([0, 2, 2, 4, 8, 17, 80]);
    expect([4, 5, 10, 15, 20, 30, 40, 50, 51].map(milestoneCores)).toEqual([0, 10, 20, 30, 40, 60, 80, 100, 0]);
    expect(waveStartCores(5)).toBe(coresForWave(5) + 10);
  });

  it('a Free Fly run earns Cores when each wave starts, and quitting keeps what was earned', () => {
    const w = new World({ seed: 5 });
    expect(w.cores).toBe(0);
    for (let t = 0; t < WAVE_TIME * 4 + 2; t += DT) { w.update(DT, idle()); w.hull = w.maxHull; w.mitosis.enemies.length = 0; }
    // waves 2, 3, 4, 5 started; wave 5 is a milestone
    expect(w.cores).toBe(coresForWave(2) + coresForWave(3) + coresForWave(4) + waveStartCores(5));
    expect(flyRunResult(w).cores).toBe(w.cores);
    const store = new ProgressStore(null);
    store.recordRun(flyRunResult(w));
    expect(store.data.cores).toBe(w.cores);
  });

  it('a campaign wall run pays no Cores', () => {
    const store = new ProgressStore(null);
    store.recordWallRun({ credits: 100, kills: 5, tier: 1, destroyed: 5, total: 5, time: 10 });
    expect(store.data.cores).toBe(0);
  });

  it('a Frontier square pays one wave of Cores per full 40 s survived (the equivalent wave capped at 30)', () => {
    expect(encounterCores(12, 39)).toBe(0);
    expect(encounterCores(12, 80)).toBe(2 * coresForWave(12));
    expect(encounterCoresPerBlock(45)).toBe(coresForWave(30));
    const store = new ProgressStore(null);
    store.recordFrontierFly({ x: 1, y: 0, credits: 5, cores: 7, kills: 2, outcome: 'passed' });
    expect(store.data.cores).toBe(7);
  });

  it('the Core Magnet multiplies the run\'s Cores (a custom hull with the trait)', () => {
    const store = storeAtRing(SHIPYARD_UNLOCK_RING);
    ownAllChunks(store, 2);
    store.setDesign(0, stack('front_gun', 'core_magnet', 'full'));
    const plain = new World({ seed: 5 });
    const magnet = new World({ seed: 5, grid: HULL_BUILDERS.custom1() });
    for (const w of [plain, magnet]) for (let t = 0; t < WAVE_TIME * 9 + 2; t += DT) { w.update(DT, idle()); w.hull = w.maxHull; w.mitosis.enemies.length = 0; }
    expect(magnet.cores).toBe(Math.floor(plain.cores * 1.1 + 1e-9) || 0);
    expect(magnet.cores).toBeGreaterThan(plain.cores);
  });
});

describe('save version 14 to 15', () => {
  it('an older save migrates to 0 Cores, no chunks, no designs; everything else is kept', () => {
    expect(PROGRESS_VERSION).toBe(15);
    const old = loadProgress(JSON.stringify({ version: 13, credits: 99, passedTiers: [1, 2], bestWave: 7, cores: 5000, chunks: { full: 3 }, designs: [SMALL(), null, null] }));
    expect(old.version).toBe(15);
    expect(old.credits).toBe(99);
    expect(old.bestWave).toBe(7);
    // A v13 save cannot hold Shipyard data; whatever such fields it carries are not trusted.
    expect(old.cores).toBe(0);
    expect(old.chunks).toEqual({});
    expect(old.designs).toEqual([null, null, null]);
    const fresh = loadProgress(null);
    expect([fresh.cores, fresh.chunks, fresh.designs]).toEqual([0, {}, [null, null, null]]);
  });

  it('a v14 save round-trips', () => {
    const p = defaultProgress();
    const turned = SMALL(); turned.rot = new Array(16).fill(0); turned.rot[8] = 3;
    p.cores = 123; p.chunks = { full: 2, front_gun: 1 }; p.designs = [turned, null, stack('corridor')];
    const back = loadProgress(serializeProgress(p));
    expect([back.cores, back.chunks, back.designs]).toEqual([123, { full: 2, front_gun: 1 }, [turned, null, stack('corridor')]]);
    expect(back.designs[0]!.rot![8]).toBe(3); // the rotation survives a save and a load
  });

  it('31c migration: Generator chunks are refunded in Cores at the price they were bought at, removed from the inventory and from designs', () => {
    // 3 copies bought at 60, 90 and 135 Cores (base 60 x 1.5^i, rounded) = 285.
    expect(generatorRefund(0)).toBe(0);
    expect(generatorRefund(1)).toBe(60);
    expect(generatorRefund(3)).toBe(60 + 90 + 135);
    const old = loadProgress(JSON.stringify({
      version: 14, cores: 100, chunks: { generator: 3, full: 2 },
      designs: [{ slots: ['front_gun', null, null, null, null, null, null, null, null, null, null, null, 'generator', null, null, null], name: 'Old' }, null, null],
    }));
    expect(old.version).toBe(15);
    expect(old.cores).toBe(100 + 285);
    expect(old.chunks).toEqual({ full: 2 }); // no generator key left
    expect(old.designs[0]!.slots[12]).toBeNull(); // the Generator chunk left the design
    expect(old.designs[0]!.slots[0]).toBe('front_gun');
    expect(old.designs[0]!.name).toBe('Old');
    expect(old.designs[0]!.rot).toBeUndefined(); // an old design has no rotations: all 0
    // Loading the migrated save again pays nothing more.
    const again = loadProgress(serializeProgress(old));
    expect(again.cores).toBe(385);
    expect(again.chunks).toEqual({ full: 2 });
  });

  it('31c migration: a save with no Generator chunk and a design with no rotation list loads unchanged', () => {
    const p = loadProgress(JSON.stringify({ version: 14, cores: 7, chunks: { full: 1 }, designs: [SMALL(), null, null] }));
    expect(p.cores).toBe(7);
    expect(p.designs[0]).toEqual(SMALL());
    expect(rotAt(p.designs[0]!, 10)).toBe(0);
  });

  it('rotations are cleaned: whole numbers taken modulo 4, anything else is 0, an all-zero list is not stored', () => {
    const slots = SMALL().slots;
    const s = sanitizeShipyard({ designs: [
      { slots, rot: [0, 1, 5, -1, 'x', 2.5, null, ...new Array(9).fill(0)] },
      { slots, rot: new Array(16).fill(0) },
      { slots, rot: 'sideways' },
    ] });
    expect(s.designs[0]!.rot!.slice(0, 7)).toEqual([0, 1, 1, 3, 0, 0, 0]);
    expect(s.designs[1]!.rot).toBeUndefined();
    expect(s.designs[2]!.rot).toBeUndefined();
    expect(cleanRot(7)).toBe(3);
  });

  it('garbage is dropped, not trusted', () => {
    const s = sanitizeShipyard({
      cores: -5, chunks: { full: 2.5, ring: 3, ghost: 4, cross: -1 },
      designs: [{ slots: ['full', 'ghost', ...new Array(14).fill(null)] }, { slots: ['full'] }, 'x', { slots: new Array(16).fill(null) }],
    });
    expect(s.cores).toBe(0);
    expect(s.chunks).toEqual({ ring: 3 });
    expect(s.designs[0]!.slots.slice(0, 3)).toEqual(['full', null, null]);
    expect(s.designs[1]).toBeNull(); // wrong length
    expect(s.designs[2]).toBeNull();
    expect(sanitizeShipyard(null)).toEqual(defaultShipyard());
    expect(sanitizeShipyard({ cores: 1e30 }).cores).toBe(1e12);
    expect(loadProgress('{"version":14,"cores":"lots"}').cores).toBe(0);
  });

  it('Export / Import carries Cores, chunks and designs', () => {
    const p = defaultProgress();
    p.cores = 77; p.chunks = { overdrive: 1 }; p.designs = [SMALL(), null, null];
    const text = exportSaveString(p, null);
    const r = checkImportString(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect([r.progress.cores, r.progress.chunks, r.progress.designs[0]]).toEqual([77, { overdrive: 1 }, SMALL()]);
  });

  it('the Cores name is one constant', () => {
    expect(CURRENCY_CORES_NAME).toBe('Cores');
  });
});

describe('trait effects in a run (folded into the modifiers by hull)', () => {
  let store: ProgressStore;
  beforeEach(() => {
    store = storeAtRing(SHIPYARD_UNLOCK_RING);
    ownAllChunks(store, 3);
    addCores(store, 0);
  });

  it('a normal hull changes nothing', () => {
    const m = neutralModifiers();
    expect(applyHullTraits(m, 'dart')).toBe(m);
    expect(applyHullTraits(m, undefined)).toBe(m);
  });

  it('Wide Open x0.7 damage, Extra Life one forgiven crash with 1.5 s untouchable', () => {
    store.setDesign(0, attach('extra_life', designOf([[], [], ['front_gun'], ['full', 'wide_open']]))!);
    const m = applyHullTraits(neutralModifiers(), 'custom1');
    expect(m.damageMul).toBeCloseTo(0.7, 9);
    expect(m.secondChances).toBe(1);
    expect(m.chanceInvuln).toBe(1.5);
  });

  it('Extra Life in Free Fly: a contact is forgiven once, the run continues, the second one costs hull', () => {
    store.setDesign(0, attach('extra_life')!);
    const w = new World({ grid: HULL_BUILDERS.custom1(), autoSpawn: false });
    expect(w.secondChancesLeft).toBe(1);
    const touch = () => { w.spawnSpecies('mitotic_rock', w.shipX, w.shipY, { hp: 1e9 }); w.update(DT, idle()); };
    touch();
    expect(w.fx.secondChance).toBe(1);
    expect(w.hull).toBe(w.maxHull);
    expect(w.invuln).toBeCloseTo(1.5, 1);
    for (let i = 0; i < 100; i++) w.update(DT, idle()); // 1.5 s passes
    w.mitosis.enemies.length = 0;
    touch();
    expect(w.hull).toBeLessThan(w.maxHull);
  });

  it('registering twice is stable and unregisters designs that are gone', () => {
    store.setDesign(0, SMALL());
    expect(registerCustomHulls(store.data, 150)).toEqual(['custom1']);
    expect(registerCustomHulls(store.data, 149)).toEqual([]);
    expect(HULL_BUILDERS.custom1).toBeUndefined();
  });
});

describe('Design type helpers', () => {
  it('designOf pads and ignores out of range slots', () => {
    const d: Design = designOf([['full'], [], [null, null, 'ring', null, 'x']]);
    expect(d.slots).toHaveLength(16);
    expect(d.slots[0]).toBe('full');
    expect(d.slots[10]).toBe('ring');
  });
});
