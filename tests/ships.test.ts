import { describe, it, expect } from 'vitest';
import { Texture } from 'pixi.js';
import { compile } from '../src/engine/compiler';
import { HULL_ORDER, STARTER_HULL, fireRateMul } from '../src/data/hulls';
import { buildDartGrid, buildProngGrid, HULL_BUILDERS, HULL_INFO } from '../src/game/gridUtils';
import { place, buildStarterGrid } from '../src/game/starter';
import { SHIP_ART, clearShipTextureCache, getShipTexture } from '../src/ui/shipArt';
import { defaultProgress, loadProgress, ProgressStore } from '../src/econ/progress';
import { BuilderModel } from '../src/builder/model';
import { loadBuilder, STORAGE_KEY } from '../src/builder/persist';
import { World } from '../src/game/world';

describe('ship art', () => {
  it('every hull id has art with valid polygons inside the unit box', () => {
    for (const id of [...HULL_ORDER, ...Object.keys(HULL_BUILDERS)]) {
      const def = SHIP_ART[id];
      expect(def, `art for ${id}`).toBeDefined();
      expect(def.layers.some(l => l.role === 'outer')).toBe(true);
      for (const l of def.layers) {
        expect(l.points.length).toBeGreaterThanOrEqual(3);
        for (const [x, y] of l.points) {
          expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1);
          expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('the cached texture is reused for a second request of the same ship', () => {
    clearShipTextureCache();
    let made = 0;
    const renderer = { generateTexture: () => { made++; return { id: made } as unknown as Texture; } };
    const a = getShipTexture(renderer, 'dart');
    const b = getShipTexture(renderer, 'dart');
    const c = getShipTexture(renderer, 'twin');
    expect(b).toBe(a);
    expect(c).not.toBe(a);
    expect(made).toBe(2);
  });
});

describe('hull ladder', () => {
  it('the ladder is Dart, Twin, Prong, Fan, Shuttle and every hull has a builder and info', () => {
    expect(HULL_ORDER.join()).toBe('dart,twin,prong,fan,shuttle');
    expect(HULL_INFO.map(h => h.id)).toEqual([...HULL_ORDER]);
    for (const id of HULL_ORDER) expect(HULL_BUILDERS[id]().hullId).toBe(id);
  });

  it('the Dart is generator, one free cell, ejector in a line, and fires 35% of the Shuttle starter DPS with a Flat+ in its slot', () => {
    const g = buildDartGrid();
    expect(g.w).toBe(1);
    expect(g.cells.map(c => c.type)).toEqual(['ejector', 'empty', 'generator']);
    expect(compile(g).recipes.length).toBe(1);      // the empty cell passes the signal straight
    place(g, 1, 2, 'flat_plus');
    const dart = compile(g).stats;
    const shuttle = compile(buildStarterGrid()).stats;
    expect(dart.damagePerShot).toBe(101);
    expect(dart.estDps / shuttle.estDps).toBeCloseTo(0.35, 2);
    expect(fireRateMul('dart')).toBe(0.35);
    expect(fireRateMul('shuttle')).toBe(1);
  });

  it('the Dart world fires at the slow rate, the Shuttle at the full rate', () => {
    const run = (grid: ReturnType<typeof buildDartGrid>) => {
      const w = new World({ grid, autoSpawn: false });
      let shots = 0;
      for (let i = 0; i < 600; i++) { const before = w.pool.count; w.update(1 / 60, { x: 270, y: 700, active: false, type: 'mouse', seen: false }); shots += Math.max(0, w.pool.count - before); }
      return shots;
    };
    const d = buildDartGrid(); place(d, 1, 2, 'flat_plus');
    const dartShots = run(d);
    const shuttleShots = run(buildStarterGrid());
    expect(dartShots).toBeLessThan(shuttleShots * 0.5);
    expect(dartShots).toBeGreaterThan(0);
  });

  it('the Prong has two ejectors that a Splitter 3 and a Turn Left both feed', () => {
    const g = buildProngGrid();
    expect(g.cells.filter(c => c.type === 'ejector').length).toBe(2);
    expect(g.cells.filter(c => c.type === 'empty').length).toBe(3);
    expect(compile(g).recipes.length).toBe(1);
    place(g, 1, 2, 'splitter_3');
    place(g, 3, 2, 'turn_l');
    expect(compile(g).recipes.length).toBe(2);
  });
});

describe('saves and the Dart', () => {
  it('a fresh save owns and selects the Dart with its slot empty', () => {
    expect(defaultProgress().ownedHulls).toEqual([STARTER_HULL]);
    const m = new BuilderModel(null, undefined, new ProgressStore(null, defaultProgress()));
    expect(m.hullId).toBe('dart');
    expect(m.grid.cells.filter(c => c.blockId).length).toBe(0);
    expect(m.compiled.recipes.length).toBe(1);
  });

  it('an old save keeps its hulls, gains the Dart, and keeps building on its selected hull', () => {
    const old = { version: 3, credits: 77, owned: { turn_l: 2 }, levels: {}, ownedHulls: ['shuttle', 'fan'], bestTier: 2, bestTime: 30, totalKills: 5, runs: 2, passedTiers: [1], clearedTiers: [] };
    const p = loadProgress(JSON.stringify(old));
    expect(p.version).toBe(4);
    expect(p.ownedHulls.sort()).toEqual(['dart', 'fan', 'shuttle']);
    expect(p.credits).toBe(77);
    expect(p.passedTiers).toEqual([1]);
    // The builder save of the same player: Fan was the active hull; a save with no active hull was on the Shuttle.
    const fan = loadBuilder(JSON.stringify({ version: 2, activeHull: 'fan', hulls: { shuttle: { active: 'A', slots: { A: [], B: [] } } } }));
    expect(fan.activeHull).toBe('fan');
    const noActive = loadBuilder(JSON.stringify({ version: 2, hulls: { shuttle: { active: 'B', slots: { A: [], B: [] } } } }));
    expect(noActive.activeHull).toBe('shuttle');
    const store = new ProgressStore(null, p);
    const mem: Record<string, string> = { [STORAGE_KEY]: JSON.stringify({ version: 2, hulls: { shuttle: { active: 'A', slots: { A: [], B: [] } } } }) };
    const m = new BuilderModel({ getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } }, undefined, store);
    expect(m.hullId).toBe('shuttle');
  });
});
