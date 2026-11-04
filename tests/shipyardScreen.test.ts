import { describe, it, expect, beforeEach } from 'vitest';
import { ShipyardEditor, EditorStore } from '../src/shipyard/editor';
import { CellEditor, CELL_CYCLE } from '../src/shipyard/cellMode';
import { cellAtPoint, cellMetrics, chunkSheet, problemSlots, slotAtPoint, slotRect, statsText, statusText, SY_GRID } from '../src/shipyard/viewLogic';
import { designOf, Design } from '../src/shipyard/design';
import { buyChunk, defaultShipyard, sanitizeShipyard, setDesign, ShipyardSave } from '../src/shipyard/state';
import { CELL_MODE_MAX, DESIGN_NAME_MAX, hasCustomArt, SHIPYARD_UNLOCK_RING } from '../src/shipyard/constants';
import { validateHullLayout } from '../src/data/hullValidate';
import { CHUNKS } from '../src/data/shipChunks';
import { CUSTOM_SHIP_ART, MAX_ACCENT_PIECES } from '../src/ui/shipShapes';
import { artSizeOf, getShipTexture, clearShipTextureCache, TextureMaker } from '../src/ui/shipArt';
import { setCustomHull } from '../src/data/hulls';
import { hullListRect, shipyardEntryRect, HULL_PANEL, HULL_TITLE_H } from '../src/builder/hullPickerLogic';
import { Texture } from 'pixi.js';

/** A store with the Shipyard open and a handful of chunks, backed by the real pure save functions. */
function makeStore(ring = SHIPYARD_UNLOCK_RING, cores = 5000): EditorStore & { save: ShipyardSave } {
  const save = defaultShipyard();
  save.cores = cores;
  save.chunks = { front_gun: 1, corridor: 2, generator: 1, full: 1 };
  return {
    save,
    data: save,
    get shipyardOpen() { return ring >= SHIPYARD_UNLOCK_RING; },
    setDesign: (slot: number, d: Design | null) => setDesign(save, slot, d, ring),
    buyChunk: (id: string) => buyChunk(save, id, ring),
  };
}

// The small valid ship of the 31a tests: Front Gun / Corridor / Generator stacked in the second column (slots 1, 5, 9, 13 are column 2).
const COL = 1;
const at = (row: number) => row * 4 + COL;

describe('ShipyardEditor: placing, removing, replacing and the counts', () => {
  let st: ReturnType<typeof makeStore>;
  let ed: ShipyardEditor;
  beforeEach(() => { st = makeStore(); ed = new ShipyardEditor(st); });

  it('placing uses one owned copy and shows in the design; free copies go down', () => {
    expect(ed.free('corridor')).toBe(2);
    expect(ed.place(at(1), 'corridor')).toEqual({ ok: true });
    expect(ed.design().slots[at(1)]).toBe('corridor');
    expect(ed.free('corridor')).toBe(1);
    expect(ed.owned('corridor')).toBe(2);
    expect(st.save.designs[0]!.slots[at(1)]).toBe('corridor'); // saved at once
  });

  it('refuses a chunk with no free copy, and a chunk that is not owned or does not exist', () => {
    expect(ed.place(at(0), 'front_gun').ok).toBe(true);
    const again = ed.place(at(1), 'front_gun');
    expect(again).toEqual({ ok: false, error: 'No Front Gun left' });
    expect(ed.place(at(1), 'twin_gun')).toEqual({ ok: false, error: 'No Twin Gun left' });
    expect(ed.place(at(1), 'nonsense')).toEqual({ ok: false, error: 'Not a chunk' });
    expect(ed.place(99, 'corridor').ok).toBe(false);
    expect(ed.design().slots[at(1)]).toBeNull();
  });

  it('removing gives the copy back; removing an empty slot is a harmless no-op', () => {
    ed.place(at(1), 'corridor');
    expect(ed.free('corridor')).toBe(1);
    expect(ed.remove(at(1)).ok).toBe(true);
    expect(ed.free('corridor')).toBe(2);
    expect(ed.design().slots[at(1)]).toBeNull();
    expect(ed.remove(at(1)).ok).toBe(true);
    expect(ed.canUndo).toBe(true);
  });

  it('replacing swaps the chunk and the copy of the old one is free again', () => {
    ed.place(at(1), 'corridor');
    expect(ed.place(at(1), 'full').ok).toBe(true);
    expect(ed.design().slots[at(1)]).toBe('full');
    expect(ed.free('corridor')).toBe(2);
    expect(ed.free('full')).toBe(0);
    // Placing the same chunk where it already is changes nothing and is not an undo step.
    const undoBefore = ed.canUndo;
    expect(ed.place(at(1), 'full').ok).toBe(true);
    expect(ed.canUndo).toBe(undoBefore);
  });

  it('buying costs Cores at the growing price and adds a copy; too few Cores is refused', () => {
    const p0 = ed.price('corridor');
    expect(p0).toBe(Math.round(15 * 1.5 ** 2)); // two owned
    const cores0 = ed.cores();
    expect(ed.buy('corridor').ok).toBe(true);
    expect(ed.owned('corridor')).toBe(3);
    expect(ed.cores()).toBe(cores0 - p0);
    st.save.cores = 1;
    expect(ed.canAfford('twin_gun')).toBe(false);
    expect(ed.buy('twin_gun')).toEqual({ ok: false, error: expect.stringContaining('Not enough Cores') });
    expect(ed.owned('twin_gun')).toBe(0);
  });
});

describe('ShipyardEditor: undo, redo and the design slots', () => {
  it('undo and redo walk the edits and a new edit clears redo', () => {
    const st = makeStore(); const ed = new ShipyardEditor(st);
    ed.place(at(0), 'front_gun'); ed.place(at(1), 'corridor');
    expect(ed.undo().ok).toBe(true);
    expect(ed.design().slots[at(1)]).toBeNull();
    expect(ed.design().slots[at(0)]).toBe('front_gun');
    expect(ed.canRedo).toBe(true);
    expect(ed.redo().ok).toBe(true);
    expect(ed.design().slots[at(1)]).toBe('corridor');
    ed.undo();
    ed.place(at(2), 'corridor');
    expect(ed.canRedo).toBe(false);
    expect(ed.redo()).toEqual({ ok: false, error: 'Nothing to redo' });
    ed.undo(); ed.undo(); ed.undo();
    expect(ed.undo()).toEqual({ ok: false, error: 'Nothing to undo' });
    expect(st.save.designs[0]).toBeNull(); // everything undone: the slot is empty again
  });

  it('switching design keeps each design and starts a fresh history', () => {
    const st = makeStore(); const ed = new ShipyardEditor(st);
    ed.place(at(0), 'front_gun');
    expect(ed.switchSlot(1).ok).toBe(true);
    expect(ed.hullId()).toBe('custom2');
    expect(ed.design().slots.every(s => s === null)).toBe(true);
    expect(ed.canUndo).toBe(false);
    ed.place(at(0), 'corridor');
    ed.switchSlot(0);
    expect(ed.design().slots[at(0)]).toBe('front_gun');
    expect(st.save.designs[1]!.slots[at(0)]).toBe('corridor');
    expect(ed.switchSlot(3).ok).toBe(false);
    expect(ed.switchSlot(-1).ok).toBe(false);
  });

  it('the name is trimmed and cut, an empty name goes back to "Custom N", and the name survives a save round-trip', () => {
    const st = makeStore(); const ed = new ShipyardEditor(st);
    ed.place(at(0), 'front_gun');
    expect(ed.label()).toBe('Custom 1');
    ed.rename('   My Spear Of Destiny Long Long ');
    expect(ed.label().length).toBeLessThanOrEqual(DESIGN_NAME_MAX);
    expect(ed.label().startsWith('My Spear')).toBe(true);
    const back = sanitizeShipyard(JSON.parse(JSON.stringify(st.save)));
    expect(back.designs[0]!.name).toBe(ed.label());
    ed.rename('  ');
    expect(ed.label()).toBe('Custom 1');
    expect(ed.slotLabels()).toEqual(['Custom 1', 'Custom 2', 'Custom 3']);
  });
});

describe('"Use this ship" gating and the status strip', () => {
  const small = () => designOf([[], [null, 'front_gun'], [null, 'corridor'], [null, 'generator']]);

  it('only a valid, fully owned design in an open Shipyard can be used', () => {
    const st = makeStore(); const ed = new ShipyardEditor(st);
    expect(ed.canUse()).toBe(false); // empty
    ed.place(at(0), 'front_gun'); ed.place(at(1), 'corridor');
    expect(ed.canUse()).toBe(false); // no generator yet
    expect(ed.problems()[0]).toMatch(/Generator/);
    ed.place(at(2), 'generator');
    // not touching the bottom row (row 4): the generator rule
    expect(ed.canUse()).toBe(false);
    expect(ed.problems().join(' ')).toMatch(/bottom row/);
    ed.place(at(3), 'generator'); // no copy left
    ed.remove(at(2));
    ed.place(at(3), 'generator');
    ed.place(at(2), 'corridor');
    expect(ed.problems()).toEqual([]);
    expect(ed.canUse()).toBe(true);
  });

  it('a design that uses more copies than owned is not usable (a copy was sold or the design was saved elsewhere)', () => {
    const st = makeStore(); const ed = new ShipyardEditor(st);
    st.setDesign(0, small());
    expect(ed.canUse()).toBe(true);
    st.save.chunks.corridor = 0;
    expect(ed.canUse()).toBe(false);
    expect(ed.problems()[0]).toBe('Needs 1 x Corridor, you own 0');
  });

  it('a closed Shipyard cannot be used and cannot save designs', () => {
    const st = makeStore(SHIPYARD_UNLOCK_RING - 1); const ed = new ShipyardEditor(st);
    expect(ed.place(at(0), 'front_gun').ok).toBe(false);
    expect(ed.canUse()).toBe(false);
    expect(statusText([], false, false)).toEqual({ text: 'The Shipyard is not open yet', valid: false });
  });

  it('the status strip says VALID or the first plain-language error with row and column', () => {
    expect(statusText([], true, true)).toEqual({ text: 'VALID', valid: true });
    const st = makeStore(); const ed = new ShipyardEditor(st);
    st.setDesign(0, designOf([[], [null, 'front_gun'], [], [null, 'generator']]));
    const s = statusText(ed.problems(), ed.canUse(), true);
    expect(s.valid).toBe(false);
    expect(s.text).toBe('Front Gun at row 2, column 2 is not connected to the generator');
    expect(problemSlots(ed.problems())).toEqual([4 + 1]);
  });

  it('the stats text lists cells, ejectors, pulses, shot speed and size', () => {
    const st = makeStore(); const ed = new ShipyardEditor(st);
    st.setDesign(0, small());
    expect(statsText(ed.stats())).toMatch(/^\d+ cells · 1 ejector · \d(\.\d)?\/s · shots x1 · (small|medium)$/);
    expect(statsText(null)).toMatch(/valid/);
  });

  it('the chunk info sheet: Place needs a free copy, Buy needs Cores', () => {
    const st = makeStore(); const ed = new ShipyardEditor(st);
    ed.place(at(0), 'front_gun');
    const sh = chunkSheet(ed, 'front_gun');
    expect(sh.place.enabled).toBe(false);
    expect(sh.ownedLine).toBe('Owned 1 · free 0');
    expect(sh.buy!.enabled).toBe(true);
    st.save.cores = 0;
    expect(chunkSheet(ed, 'front_gun').buy!.enabled).toBe(false);
    expect(chunkSheet(ed, 'corridor').place.enabled).toBe(true);
  });
});

describe('screen geometry', () => {
  it('every slot maps back to itself and taps outside the grid miss', () => {
    for (let i = 0; i < 16; i++) { const r = slotRect(i); expect(slotAtPoint(r.x + r.w / 2, r.y + r.h / 2)).toBe(i); }
    expect(slotAtPoint(SY_GRID.x - 1, SY_GRID.y + 5)).toBe(-1);
    expect(slotAtPoint(SY_GRID.x + 5, SY_GRID.y + SY_GRID.h)).toBe(-1);
  });
  it('cells fit the grid square at every size up to 12 x 12', () => {
    for (const [w, h] of [[1, 1], [5, 6], [12, 12], [12, 3]]) {
      const m = cellMetrics(w, h);
      expect(m.ox).toBeGreaterThanOrEqual(SY_GRID.x - 0.001);
      expect(m.ox + w * m.size).toBeLessThanOrEqual(SY_GRID.x + SY_GRID.w + 0.001);
      expect(m.oy + h * m.size).toBeLessThanOrEqual(SY_GRID.y + SY_GRID.h + 0.001);
      expect(cellAtPoint(w, h, m.ox + m.size * (w - 0.5), m.oy + m.size * (h - 0.5))).toEqual({ x: w - 1, y: h - 1 });
    }
  });
  it('the Shipyard entry is pinned under the tab strip and the hull list starts below it', () => {
    const e = shipyardEntryRect();
    expect(e.y).toBeGreaterThanOrEqual(HULL_PANEL.y + HULL_TITLE_H);
    expect(hullListRect(false).y).toBeGreaterThanOrEqual(e.y + e.h);
    expect(hullListRect(false).y + hullListRect(false).h).toBe(HULL_PANEL.y + HULL_PANEL.h);
  });

});

describe('debug cell mode', () => {
  it('a tap cycles outside -> buildable -> generator -> ejector -> outside', () => {
    const c = new CellEditor(3, 3);
    expect([...CELL_CYCLE]).toEqual(['.', '_', 'G', 'E']);
    expect([c.cycle(1, 1), c.cycle(1, 1), c.cycle(1, 1), c.cycle(1, 1), c.cycle(1, 1)]).toEqual(['_', 'G', 'E', '.', '_']);
    expect(c.cycle(3, 0)).toBeNull();
    expect(c.cycle(-1, 0)).toBeNull();
  });

  it('resize is clamped to 1..12, keeps cells in place and fills the new ones with outside', () => {
    const c = new CellEditor(2, 2);
    c.cycle(1, 1);
    c.resize(4, 3);
    expect(c.get(1, 1)).toBe('_');
    expect(c.get(3, 2)).toBe('.');
    c.resize(99, 0);
    expect([c.w, c.h]).toEqual([CELL_MODE_MAX, 1]);
    c.resize(-3, 50);
    expect([c.w, c.h]).toEqual([1, CELL_MODE_MAX]);
  });

  it('an empty layout and a bad one give the same plain sentences as the hull checks', () => {
    const c = new CellEditor(3, 3);
    expect(c.problems()[0]).toMatch(/empty/);
    c.cycle(1, 0); // a lone buildable cell
    const p = c.problems();
    expect(p).toEqual(validateHullLayout('Cell mode', c.rows()));
    expect(p.join(' ')).toMatch(/needs exactly 1 generator/);
  });

  it('a valid drawing exports as ROWS text that passes validateHullLayout, trimmed to its shape', () => {
    const c = new CellEditor(6, 6);
    // Two ejectors over a row of three over a stem to the generator, drawn off to the right of a 6 x 6 grid.
    const draw = (x: number, y: number, n: number) => { for (let i = 0; i < n; i++) c.cycle(x, y); };
    draw(3, 1, 3); draw(5, 1, 3);      // E E  (3 taps = ejector)
    draw(3, 2, 1); draw(4, 2, 1); draw(5, 2, 1);
    draw(4, 3, 1); draw(4, 4, 1);
    draw(4, 5, 2);                      // G
    expect(c.problems()).toEqual([]);
    const rows = c.rows();
    expect(rows).toEqual(['E.E', '___', '._.', '._.', '.G.']);
    const text = c.exportText('COOL');
    expect(text).toContain('const COOL_ROWS = [');
    // Paste it back: the quoted rows are the rows, and they pass the hull checks.
    const back = [...text.matchAll(/^\s+'([._GE]+)',$/gm)].map(m => m[1]);
    expect(back).toEqual(rows);
    expect(validateHullLayout('COOL', back)).toEqual([]);
    expect(rows.every(r => r.length === rows[0].length)).toBe(true);
  });

  it('an ejector with a cell above it or a generator not on the bottom row is explained', () => {
    const c = new CellEditor(1, 4);
    c.cycle(0, 0); c.cycle(0, 0); c.cycle(0, 0); // E on top
    c.cycle(0, 1);                                // buildable
    c.cycle(0, 2); c.cycle(0, 2);                 // G
    // row 4 left empty: the bottom row is kept, so G is not on the bottom row
    expect(c.problems().join(' ')).toMatch(/must be on the bottom row/);
  });
});

describe('custom ship art', () => {
  it('has a broad body, engines with flames and at most four accent pieces of one colour', () => {
    const accents = CUSTOM_SHIP_ART.parts.filter(p => p.tone === 'accent');
    expect(accents.length).toBeGreaterThan(0);
    expect(accents.length).toBeLessThanOrEqual(MAX_ACCENT_PIECES);
    expect(CUSTOM_SHIP_ART.flames.length).toBeGreaterThanOrEqual(2);
    const xs = CUSTOM_SHIP_ART.parts.filter(p => p.tone === 'edge').flatMap(p => p.points.map(q => q[0]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.8); // broad
  });

  it('custom hulls and the cell-test hull use it; the texture follows the size class of the design', () => {
    expect(hasCustomArt('custom1') && hasCustomArt('custom3') && hasCustomArt('celltest')).toBe(true);
    expect(hasCustomArt('zenith') || hasCustomArt('custom4') || hasCustomArt('dart')).toBe(false);
    const made: number[] = [];
    const maker: TextureMaker = { generateTexture: () => { made.push(made.length); return Texture.EMPTY; } };
    clearShipTextureCache();
    const stats = (size: 'small' | 'huge') => ({ name: 'Custom 1', price: 0, pulsesPerSec: 3, shotSpeed: 1, size });
    setCustomHull('custom1', { name: 'Custom 1', rows: ['E', '_', 'G'], damageMul: 1, lives: 0, coresMul: 1, stats: stats('small') });
    const small = artSizeOf('custom1');
    getShipTexture(maker, 'custom1');
    getShipTexture(maker, 'custom1');
    expect(made.length).toBe(1); // cached
    setCustomHull('custom1', { name: 'Custom 1', rows: ['E', '_', 'G'], damageMul: 1, lives: 0, coresMul: 1, stats: stats('huge') });
    expect(artSizeOf('custom1').w).toBeGreaterThan(small.w);
    getShipTexture(maker, 'custom1');
    expect(made.length).toBe(2); // a new size class draws a new texture, not the stale one
    setCustomHull('custom1', null);
  });
});

describe('every chunk can be drawn and sold', () => {
  it('the palette lists the 16 chunks, each with a pattern and a price', () => {
    const st = makeStore(); const ed = new ShipyardEditor(st);
    expect(CHUNKS.length).toBe(16);
    for (const c of CHUNKS) { expect(ed.price(c.id)).toBeGreaterThan(0); expect(chunkSheet(ed, c.id).title).toBe(c.name); }
  });
});
