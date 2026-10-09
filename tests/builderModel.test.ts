import { describe, it, expect } from 'vitest';
import { BuilderModel, StorageLike, UNDO_LIMIT } from '../src/builder/model';
import { decodeLayout, DEFAULT_SHUTTLE_A, LEGACY_KEY, legacyCellType, loadBuilder, STORAGE_KEY } from '../src/builder/persist';
import '../src/data/blocks';

function memStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
    removeItem: (k) => { delete data[k]; },
  };
}

// Cell coordinates below are 0-indexed (x,y): the default Flat+ sits at (8,5) = col 9, row 6.
const FLAT = { x: 8, y: 5 };

describe('builder model: edits, inventory and rotation', () => {
  it('starts with the default circuit: reaches the ejector, >= 100 damage, all blocks auto', () => {
    const m = new BuilderModel(null);
    expect(m.compiled.recipes.length).toBe(1);
    expect(m.compiled.stats.damagePerShot).toBeGreaterThanOrEqual(100);
    expect(m.grid.cells.filter(c => c.blockId).every(c => c.manual === false)).toBe(true);
    expect(m.active).toBe('A');
  });

  it('placing decrements and removing / replacing returns the inventory', () => {
    const m = new BuilderModel(null);
    const before = m.available('percent_mult');
    expect(m.place(8, 4, 'percent_mult')).toEqual({ ok: true });
    expect(m.available('percent_mult')).toBe(before - 1);
    expect(m.place(8, 4, 'jackpot')).toEqual({ ok: true }); // replace
    expect(m.available('percent_mult')).toBe(before);
    expect(m.remove(8, 4)).toEqual({ ok: true });
    expect(m.available('jackpot')).toBe(m.owned.jackpot);
  });

  it('refuses to place on fixed cells, with no blocks left, or a hidden block', () => {
    const m = new BuilderModel(null);
    expect(m.place(5, 0, 'flat_plus').ok).toBe(false); // void cell (6,1)
    expect(m.place(5, 10, 'flat_plus').ok).toBe(false); // generator
    expect(m.place(8, 1, 'flat_plus').ok).toBe(false); // ejector
    expect(m.place(0, 0, 'flat_plus').ok).toBe(false); // void
    expect(m.place(7, 4, 'straight').ok).toBe(false); // removed block
    expect(m.place(7, 4, 'crossover').ok).toBe(false); // hidden perk block
    m.owned.jackpot = 0;
    expect(m.place(7, 4, 'jackpot').ok).toBe(false);
  });

  it('rotating switches to manual from the displayed orientation and blocks / unblocks the line', () => {
    const m = new BuilderModel(null);
    const dmg = () => m.compiled.stats.damagePerShot;
    expect(dmg()).toBe(101);

    m.rotate(FLAT.x, FLAT.y, 1); // CW: faces east, the signal arrives heading north
    let c = m.cellAt(FLAT.x, FLAT.y)!;
    expect(c).toMatchObject({ rotation: 90, manual: true });
    expect(m.compiled.recipes.length).toBe(0);
    expect(m.compiled.cellInfo[FLAT.y * m.grid.w + FLAT.x].warning).toMatch(/wrong side/i);

    m.rotate(FLAT.x, FLAT.y, -1); // CCW: back to facing north
    c = m.cellAt(FLAT.x, FLAT.y)!;
    expect(c).toMatchObject({ rotation: 0, manual: true });
    expect(dmg()).toBe(101);

    m.autoOrient(FLAT.x, FLAT.y);
    expect(m.cellAt(FLAT.x, FLAT.y)).toMatchObject({ manual: false });
    expect(m.compiled.cellInfo[FLAT.y * m.grid.w + FLAT.x].orientationMode).toBe('auto');
  });

  it('four clockwise rotations return to the start; off-line blocks can be pre-oriented', () => {
    const m = new BuilderModel(null);
    m.place(3, 3, 'percent_mult'); // off the line
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) { m.rotate(3, 3, 1); seen.push(m.cellAt(3, 3)!.rotation); }
    expect(seen).toEqual([90, 180, 270, 0]);
    expect(m.cellAt(3, 3)!.manual).toBe(true);
    m.rotate(3, 3, -1);
    expect(m.cellAt(3, 3)!.rotation).toBe(270);
  });

  it('rotation starts from the displayed (auto) orientation, not the stored one', () => {
    const m = new BuilderModel(null);
    m.place(6, 8, 'flat_plus'); // horizontal part of the route: auto shows it facing east
    expect(m.compiled.cellInfo[8 * m.grid.w + 6].effectiveRotation).toBe(90);
    m.rotate(6, 8, 1);
    expect(m.cellAt(6, 8)).toMatchObject({ rotation: 180, manual: true });
  });

  it('clear all empties the circuit and is a no-op error when already empty', () => {
    const m = new BuilderModel(null);
    expect(m.clearAll().ok).toBe(true);
    expect(m.grid.cells.some(c => c.blockId)).toBe(false);
    expect(m.clearAll().ok).toBe(false);
    expect(m.compiled.recipes.length).toBe(0);
  });

  it('undo / redo cover place, rotate, auto-orient, clear cell, clear all and paste', () => {
    const m = new BuilderModel(null);
    const sig = () => JSON.stringify(m.grid.cells.filter(c => c.blockId));
    const states = [sig()];
    m.place(8, 4, 'percent_mult'); states.push(sig());
    m.rotate(8, 4, 1); states.push(sig());
    m.autoOrient(8, 4); states.push(sig());
    m.remove(8, 4); states.push(sig());
    m.clearAll(); states.push(sig());
    const clip = JSON.stringify({ mgbm: 'layout', v: 2, hull: 'shuttle', blocks: DEFAULT_SHUTTLE_A });
    expect(m.pasteLayout(clip).ok).toBe(true);
    states.push(sig());
    for (let i = states.length - 1; i > 0; i--) { expect(sig()).toBe(states[i]); expect(m.undo()).toBe(true); }
    expect(sig()).toBe(states[0]);
    expect(m.canUndo).toBe(false);
    for (let i = 1; i < states.length; i++) { expect(m.redo()).toBe(true); expect(sig()).toBe(states[i]); }
    expect(m.canRedo).toBe(false);
  });

  it('a new edit clears the redo stack and history is capped at 50', () => {
    const m = new BuilderModel(null);
    m.place(8, 4, 'percent_mult');
    m.undo();
    expect(m.canRedo).toBe(true);
    m.place(8, 3, 'jackpot');
    expect(m.canRedo).toBe(false);
    for (let i = 0; i < 80; i++) { m.rotate(8, 3, 1); }
    let n = 0;
    while (m.undo()) n++;
    expect(n).toBe(UNDO_LIMIT);
  });

  it('A and B are independent circuits; switching keeps each one and its history', () => {
    const m = new BuilderModel(null);
    expect(m.grid.cells.filter(c => c.blockId).length).toBe(3);
    m.switchSlot('B');
    expect(m.grid.cells.filter(c => c.blockId).length).toBe(0);
    expect(m.compiled.recipes.length).toBe(0);
    m.place(5, 8, 'turn_r');
    expect(m.canUndo).toBe(true);
    m.switchSlot('A');
    expect(m.grid.cells.filter(c => c.blockId).length).toBe(3);
    expect(m.canUndo).toBe(false);
    m.switchSlot('B');
    expect(m.grid.cells.filter(c => c.blockId).length).toBe(1);
  });

  it('preview compiles a block into a cell without changing the circuit and reports the new stats', () => {
    const m = new BuilderModel(null);
    const before = JSON.stringify(m.grid);
    const p = m.previewPlace(8, 4, 'percent_mult')!;
    expect(p.compiled.stats.damagePerShot).toBe(101 * 1.5);
    expect(JSON.stringify(m.grid)).toBe(before);
    expect(m.previewPlace(5, 0, 'percent_mult')).toBeNull();
  });
});

describe('builder persistence', () => {
  it('round-trips both circuits, rotation, manual flag and the active slot', () => {
    const storage = memStorage();
    const a = new BuilderModel(storage);
    a.rotate(FLAT.x, FLAT.y, 1);
    a.place(3, 3, 'percent_mult');
    a.rotate(3, 3, -1);
    a.switchSlot('B');
    a.place(5, 8, 'turn_l');

    const b = new BuilderModel(storage);
    expect(b.active).toBe('B');
    expect(b.cellAt(5, 8)).toMatchObject({ blockId: 'turn_l', manual: false });
    b.switchSlot('A');
    expect(b.cellAt(FLAT.x, FLAT.y)).toMatchObject({ blockId: 'flat_plus', rotation: 90, manual: true });
    expect(b.cellAt(3, 3)).toMatchObject({ blockId: 'percent_mult', rotation: 270, manual: true });
    expect(b.compiled.recipes.length).toBe(0); // the manually rotated Flat+ still blocks the line
  });

  it('migrates the old format: drops Straight and fixed cells, resets rotations to auto', () => {
    const oldCells = [
      { x: 5, y: 7, blockId: 'generator', level: 1, rotation: 0, type: 'generator', facing: 'N' },
      { x: 5, y: 6, blockId: 'straight', level: 1, rotation: 0, type: 'empty' },
      { x: 5, y: 5, blockId: 'flat_plus', level: 1, rotation: 3, type: 'empty' },
      { x: 4, y: 4, blockId: 'turn_r', level: 1, rotation: 2, type: 'empty' },
      { x: 4, y: 3, blockId: 'splitter_2', level: 1, rotation: 1, type: 'void' },
    ];
    const storage = memStorage({ [LEGACY_KEY]: JSON.stringify({ w: 11, h: 11, cells: oldCells }) });
    const m = new BuilderModel(storage);
    const blocks = m.grid.cells.filter(c => c.blockId);
    expect(blocks.map(c => c.blockId).sort()).toEqual(['flat_plus', 'turn_r']);
    expect(blocks.every(c => c.rotation === 0 && c.manual === false)).toBe(true);
    expect(m.grid.cells.some(c => c.blockId === 'straight')).toBe(false);
    expect(storage.data[STORAGE_KEY]).toBeDefined(); // written in the new format
    expect(storage.data[LEGACY_KEY]).toBeUndefined();
  });

  it("an old save with 'blocked' cells loads them as void, keeps the player's blocks and does not crash", () => {
    const oldCells = [
      { x: 5, y: 0, blockId: null, level: 1, rotation: 0, type: 'blocked' },
      { x: 2, y: 1, blockId: null, level: 1, rotation: 0, type: 'blocked' },
      { x: 5, y: 8, blockId: 'turn_r', level: 1, rotation: 0, type: 'empty' },
      { x: 8, y: 8, blockId: 'turn_l', level: 1, rotation: 0, type: 'empty' },
      { x: 8, y: 5, blockId: 'flat_plus', level: 1, rotation: 0, type: 'empty' },
      { x: 4, y: 0, blockId: 'turn_l', level: 1, rotation: 0, type: 'blocked' }, // a block somehow stored on a blocked cell
    ];
    const storage = memStorage({ [LEGACY_KEY]: JSON.stringify({ w: 11, h: 11, cells: oldCells }) });
    let m!: BuilderModel;
    expect(() => { m = new BuilderModel(storage); }).not.toThrow();
    expect(m.cellAt(5, 0)?.type).toBe('void');
    expect(m.cellAt(2, 1)?.type).toBe('void');
    expect(m.grid.cells.some(c => (c.type as string) === 'blocked')).toBe(false);
    expect(m.grid.cells.filter(c => c.blockId).map(c => `${c.x},${c.y}:${c.blockId}`).sort())
      .toEqual(['5,8:turn_r', '8,5:flat_plus', '8,8:turn_l']);
    expect(m.compiled.recipes.length).toBe(1);
    expect(legacyCellType('blocked')).toBe('void');
    expect(legacyCellType('nonsense')).toBeNull();
  });

  it('drops Straight and bad entries from a current-format save without crashing', () => {
    const bad = {
      version: 2,
      hulls: {
        shuttle: {
          active: 'Z',
          slots: {
            A: [
              { x: 5, y: 8, blockId: 'straight', level: 1, rotation: 0, manual: false },
              { x: 5, y: 8, blockId: 'turn_r', level: 99, rotation: 45, manual: true },
              { x: 5, y: 8, blockId: 'jackpot', level: 1, rotation: 0, manual: false }, // duplicate cell
              { x: -1, y: 3, blockId: 'turn_r' },
              { x: 'a', y: 3, blockId: 'turn_r' },
              { x: 5, y: 0, blockId: 'turn_r', level: 1, rotation: 0, manual: false }, // void cell (6,1)
              null, 7, 'x',
            ],
            B: 'nonsense',
          },
        },
      },
    };
    const m = new BuilderModel(memStorage({ [STORAGE_KEY]: JSON.stringify(bad) }));
    expect(m.active).toBe('A');
    const blocks = m.grid.cells.filter(c => c.blockId);
    expect(blocks.length).toBe(1);
    expect(blocks[0]).toMatchObject({ blockId: 'turn_r', level: 1, rotation: 0, manual: false });
  });

  it('corrupt or foreign JSON falls back to the default circuit', () => {
    for (const raw of ['{ broken', 'null', '42', '"x"', '{"version":1}', '[]', '{"version":2,"hulls":5}']) {
      const m = new BuilderModel(memStorage({ [STORAGE_KEY]: raw }));
      expect(m.grid.cells.filter(c => c.blockId).length).toBe(3);
      expect(m.compiled.recipes.length).toBe(1);
    }
    expect(loadBuilder('{ broken', '{ also broken').hulls.shuttle.slots.A.length).toBe(3);
  });

  it('works with no storage at all and survives a throwing storage', () => {
    const throwing: StorageLike = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    };
    const m = new BuilderModel(throwing);
    expect(m.place(8, 4, 'percent_mult').ok).toBe(true);
    expect(m.compiled.stats.damagePerShot).toBe(151.5);
  });

  it('copy / paste round-trips a layout and rejects junk with a message', () => {
    const m = new BuilderModel(null);
    m.rotate(FLAT.x, FLAT.y, 1);
    const clip = m.copyLayout();
    m.clearAll();
    expect(m.pasteLayout(clip).ok).toBe(true);
    expect(m.cellAt(FLAT.x, FLAT.y)).toMatchObject({ blockId: 'flat_plus', rotation: 90, manual: true });

    for (const junk of ['', 'not json', '{}', '{"mgbm":"layout","v":1}', '{"mgbm":"layout","v":2,"hull":"fan","blocks":[]}']) {
      const r = m.pasteLayout(junk);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
    expect(decodeLayout(clip, 'fan').ok).toBe(false);
    m.owned.flat_plus = 0;
    expect(m.pasteLayout(clip).ok).toBe(false);
  });
});

describe('builder model: hulls', () => {
  it('switching hulls keeps a separate pair of circuits per hull and remembers the active hull', () => {
    const storage = memStorage();
    const m = new BuilderModel(storage);
    expect(m.hullId).toBe('shuttle');
    expect(m.switchHull('fan').ok).toBe(true);
    expect(m.grid.w).toBe(9);
    expect(m.grid.cells.filter(c => c.blockId).length).toBe(0); // the Fan hull starts empty
    expect(m.place(4, 4, 'splitter_3').ok).toBe(true);
    expect(m.compiled.stats.projectilesPerPulse).toBe(1);
    expect(m.switchHull('shuttle').ok).toBe(true);
    expect(m.grid.cells.filter(c => c.blockId).length).toBe(3);

    m.switchHull('fan');
    const again = new BuilderModel(storage);
    expect(again.hullId).toBe('fan');
    expect(again.cellAt(4, 4)?.blockId).toBe('splitter_3');
  });

  it('refuses an unknown hull and ignores an unknown saved hull', () => {
    const m = new BuilderModel(null);
    expect(m.switchHull('nope').ok).toBe(false);
    const bad = new BuilderModel(memStorage({ [STORAGE_KEY]: JSON.stringify({ version: 2, activeHull: 'nope', hulls: {} }) }));
    expect(bad.hullId).toBe('shuttle');
  });
});
