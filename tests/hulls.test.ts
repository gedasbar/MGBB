import { describe, it, expect } from 'vitest';
import { HULL_ORDER, HULLS, SIZE_CLASSES, fireRateMul, hitRadiusOf, shotSpeedMul, sizeClassOf } from '../src/data/hulls';
import { HULL_BUILDERS, HULL_INFO } from '../src/game/gridUtils';
import { HULL_ROWS } from '../src/data/hullLayouts';
import { validateHullLayout } from '../src/data/hullValidate';
import { buildPathGrid } from '../src/game/starter';
import { standardBuild } from '../src/debug/hullBuilds';
import { compile } from '../src/engine/compiler';
import { World } from '../src/game/world';
import { PROJECTILE_SPEED } from '../src/game/fire';
import { WallWorld } from '../src/wall/wallWorld';
import { BlockDef, LevelDef } from '../src/wall/level';
import { CELL, WALL_COLS } from '../src/wall/constants';
import { HIT_RADIUS } from '../src/config';
import { defaultProgress, loadProgress, ProgressStore, PROGRESS_VERSION, richProgress } from '../src/econ/progress';
import { BuilderModel } from '../src/builder/model';
import { copyAffordable, hullAffordable } from '../src/builder/paletteLogic';
import { buyAndSelectHull, hullRows, hullStatLine } from '../src/builder/hullPickerLogic';
import { generateShipArt, artSizeOf, SHIP_ART } from '../src/ui/shipArt';
import { fmtDamage } from '../src/ui/format';
import { jump } from './helpers/jump';

/** The ladder of the brief (chunk 17a): free cells, ejectors, pulses/s, shot speed, size class, price. */
const LADDER: [string, number, number, number, number, string][] = [
  ['dart', 1, 1, 2, 1, 'small'], ['twin', 2, 1, 2.5, 1, 'small'], ['prong', 3, 2, 4, 1, 'small'], ['wisp', 5, 1, 3, 1.2, 'small'],
  ['hornet', 9, 2, 3, 1, 'small'], ['lancet', 7, 1, 5, 1.3, 'small'], ['kestrel', 12, 3, 2.5, 1, 'medium'], ['mantis', 14, 1, 4, 1.2, 'medium'],
  ['bastion', 18, 4, 2, 0.9, 'medium'], ['halberd', 22, 3, 3, 1, 'medium'], ['corvette', 26, 2, 4.5, 1.1, 'medium'], ['trident', 30, 3, 3, 1.1, 'medium'],
  ['galleon', 36, 5, 2, 0.9, 'big'], ['shuttle', 47, 1, 5, 1, 'big'], ['spire', 42, 6, 3.5, 1, 'big'], ['leviathan', 55, 4, 4, 1, 'big'],
  ['fan', 72, 3, 4, 1, 'big'], ['citadel', 64, 8, 3, 1, 'huge'], ['zenith', 80, 10, 4, 1, 'huge'],
];

const count = (rows: string[], ch: string) => rows.join('').split(ch).length - 1;

describe('hull ladder layouts', () => {
  it('has 19 hulls in the order of the brief', () => {
    expect([...HULL_ORDER]).toEqual(LADDER.map(l => l[0]));
    expect(HULL_INFO.map(h => h.id)).toEqual([...HULL_ORDER]);
  });

  it.each(LADDER)('%s: stats match the ladder and the layout is valid', (id, cells, ejectors, pulses, shot, size) => {
    const rows = HULL_ROWS[id];
    // plain-language messages, e.g. "Kestrel: needs 3 ejectors, found 2" (see src/data/hullValidate.ts)
    expect(validateHullLayout(HULLS[id as keyof typeof HULLS].name, rows, { cells, ejectors }), 'layout problems').toEqual([]);
    expect(HULLS[id as keyof typeof HULLS].pulsesPerSec).toBe(pulses);
    expect(HULLS[id as keyof typeof HULLS].shotSpeed).toBe(shot);
    expect(sizeClassOf(id)).toBe(size);
    const s = hullStatLine(id);
    expect([s.cells, s.ejectors]).toEqual([cells, ejectors]);
    // the grid the builders make has the same counts, and a free cell above the generator (the signal only leaves upward)
    const g = HULL_BUILDERS[id]();
    expect(g.cells.filter(c => c.type === 'empty').length).toBe(cells);
    expect(g.cells.filter(c => c.type === 'ejector').length).toBe(ejectors);
    const gen = g.cells.find(c => c.type === 'generator')!;
    expect(g.cells[(gen.y - 1) * g.w + gen.x].type).not.toBe('void');
    // ejectors sit on the top or upper edges: nothing buildable above them
    for (const e of g.cells.filter(c => c.type === 'ejector')) {
      const above = e.y > 0 ? g.cells[(e.y - 1) * g.w + e.x].type : 'void';
      expect(above).toBe('void');
    }
  });

  it.each(LADDER.map(l => [l[0]]))('%s: no other hull has the same shape', (id) => {
    const rows = HULL_ROWS[id];
    for (const other of HULL_ORDER) if (other !== id) expect(HULL_ROWS[other].join('|')).not.toBe(rows.join('|'));
  });

  it('the validator explains mistakes in plain words', () => {
    const hornet = HULL_ROWS.hornet;
    expect(validateHullLayout('Hornet', hornet, { cells: 9, ejectors: 2 })).toEqual([]);
    expect(validateHullLayout('Hornet', hornet, { cells: 9, ejectors: 3 })).toEqual(['Hornet: needs 3 ejectors, found 2']);
    expect(validateHullLayout('Hornet', hornet, { cells: 10, ejectors: 2 })).toEqual(['Hornet: needs 10 buildable cells (_), found 9']);
    const cut = hornet.map(r => r);
    cut[3] = '__.__';                                                            // cuts the bottom row in two
    expect(validateHullLayout('Hornet', cut)).toContain('Hornet: the cell at row 3, column 1 cannot be reached from G');
    expect(validateHullLayout('Hornet', ['E', '_', 'x', 'G'])).toEqual(['Hornet: the character "x" at row 3, column 1 is not allowed; use only _ . G E']);
    expect(validateHullLayout('Hornet', ['E', '_', 'G', '_'])).toContain('Hornet: the generator (G) is on row 3 but must be on the bottom row, row 4');
    expect(validateHullLayout('Hornet', ['E', '_', '_', 'G', '.']).length).toBeGreaterThan(0);
  });

  it.each(LADDER.map(l => [l[0], l[2]] as [string, number]))('%s: every ejector can be fed by a plain straight-and-turn path', (id, ejectors) => {
    for (let k = 0; k < ejectors; k++) {
      const g = buildPathGrid(id, k);
      expect(g, `path to ejector ${k}`).not.toBeNull();
      const target = g!.cells.filter(c => c.type === 'ejector')[k];
      expect(compile(g!).recipes.some(r => r.x === target.x && r.y === target.y)).toBe(true);
    }
  });

  it('the sensible build of every hull routes and fires (feeds three ejectors when it can)', () => {
    for (const id of HULL_ORDER) {
      const g = standardBuild(id);
      expect(g, id).not.toBeNull();
      const c = compile(g!);
      expect(c.recipes.length, id).toBeGreaterThanOrEqual(1);
      if (HULLS[id].pulsesPerSec > 0 && hullStatLine(id).ejectors >= 3 && id !== 'bastion') expect(c.recipes.length, id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('hull prices', () => {
  it('are free then strictly increasing, growing by no more than x2.2 a hull after the Prong', () => {
    const prices = HULL_ORDER.map(id => HULLS[id].price);
    expect(prices[0]).toBe(0);
    for (let i = 1; i < prices.length; i++) expect(prices[i]).toBeGreaterThan(prices[i - 1]);
    expect(prices.slice(0, 3)).toEqual([0, 70, 350]);                           // Dart, Twin, Prong unchanged
    for (let i = 4; i < prices.length; i++) {
      const g = prices[i] / prices[i - 1];
      expect(g).toBeGreaterThan(1.4);
      expect(g).toBeLessThan(2.2);
    }
  });
});

describe('size classes and shot speed', () => {
  it('map every class to its art box and hit radius (small = today: 26 x 34 px, radius 8)', () => {
    expect(SIZE_CLASSES.small).toEqual({ artW: 26, artH: 34, hitRadius: HIT_RADIUS });
    expect(SIZE_CLASSES.medium.hitRadius).toBe(9);
    expect(SIZE_CLASSES.big.hitRadius).toBe(10);
    expect(SIZE_CLASSES.huge.hitRadius).toBe(11);
    expect(hitRadiusOf('dart')).toBe(8);
    expect(hitRadiusOf('kestrel')).toBe(9);
    expect(hitRadiusOf('galleon')).toBe(10);
    expect(hitRadiusOf('zenith')).toBe(11);
    expect(hitRadiusOf('nonsense')).toBe(8);
    expect(artSizeOf('citadel')).toEqual({ w: 56, h: 70 });
    expect(artSizeOf('wisp')).toEqual({ w: 26, h: 34 });
  });

  it('a generated hull art follows its layout: a plate per cell, a tip per ejector, inside the unit box', () => {
    for (const id of HULL_ORDER) {
      const def = SHIP_ART[id];
      expect(def, id).toBeDefined();
    }
    const def = generateShipArt('citadel', HULL_ROWS.citadel);
    expect(def.accents!.length).toBe(8);
    const outer = def.layers.filter(l => l.role === 'outer');
    expect(outer.length).toBe(count(HULL_ROWS.citadel, '_') + 8 + 1);          // free cells + ejectors + the generator
    const hole = generateShipArt('citadel', HULL_ROWS.citadel);
    expect(hole.layers.every(l => l.points.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1))).toBe(true);
  });

  it('the world and the wall world take the hit radius from the hull', () => {
    for (const id of ['dart', 'kestrel', 'galleon', 'citadel']) {
      const g = standardBuild(id)!;
      expect(new World({ grid: g, autoSpawn: false }).hitR).toBe(hitRadiusOf(id));
      const lvl: LevelDef = { tier: 1, cols: WALL_COLS, rows: 1, cells: new Array(WALL_COLS).fill(null), approachSpeed: 0, wrap: true };
      expect(new WallWorld(lvl, { grid: g }).hitR).toBe(hitRadiusOf(id));
    }
  });

  it('Free Fly: a rock 19 px from the ship centre (radius 10) misses a small hull and touches a big one', () => {
    const touch = (hull: string) => {
      const w = new World({ grid: HULL_BUILDERS[hull](), autoSpawn: false });
      w.invuln = 0;
      const e = w.mitosis.spawn('mitotic_rock', 1, 100, w.shipX, w.shipY - 19, 10)!;
      e.vx = 0; e.vy = 0;
      const before = w.hull;
      jump(w, { x: w.shipX, y: w.shipY }, 1 / 60);
      return w.hull < before;
    };
    expect(touch('dart')).toBe(false);      // 19 > 10 + 8
    expect(touch('wisp')).toBe(false);
    expect(touch('galleon')).toBe(true);    // 19 < 10 + 10
    expect(touch('citadel')).toBe(true);
  });

  it('a bigger hull crashes into a block that a small one passes (block edge 9 px away)', () => {
    const plain = (): BlockDef => ({ hp: 100, armor: 0, shield: 0 });
    const run = (hull: string) => {
      const cells = Array.from({ length: WALL_COLS }, (_, c) => (c === 5 ? plain() : null));
      const w = new WallWorld({ tier: 1, cols: WALL_COLS, rows: 1, cells, approachSpeed: 0, wrap: true }, { grid: HULL_BUILDERS[hull]() });
      w.autoFire = false;
      w.setWallOffset(300);
      jump(w, { x: 6 * CELL + 9, y: 300 - 27 }, 1 / 60);
      return w.state;
    };
    expect(run('dart')).toBe('playing');       // 9 px from the block: outside radius 8
    expect(run('galleon')).toBe('crashed');    // radius 10 reaches it
  });

  it('the shot speed multiplier scales the projectile speed of the hull', () => {
    const speedOf = (id: string) => {
      const g = HULL_BUILDERS[id]();
      const w = new World({ grid: g, autoSpawn: false });
      w.fire();
      for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i]) return Math.hypot(w.pool.vx[i], w.pool.vy[i]);
      return 0;
    };
    expect(shotSpeedMul('wisp')).toBe(1.2);
    expect(shotSpeedMul('dart')).toBe(1);
    expect(shotSpeedMul('bastion')).toBe(0.9);
    expect(speedOf('dart')).toBeCloseTo(PROJECTILE_SPEED, 3);
    expect(speedOf('wisp')).toBeCloseTo(PROJECTILE_SPEED * 1.2, 3);
    expect(speedOf('wisp') / speedOf('dart')).toBeCloseTo(1.2, 5);
    expect(fireRateMul('lancet')).toBeCloseTo(5 / 4, 9);
  });
});

describe('buying a hull from the picker', () => {
  const model = (credits: number) => {
    const p = defaultProgress();
    p.credits = credits;
    p.owned.turn_l = 5;
    return new BuilderModel(null, undefined, new ProgressStore(null, p));
  };

  it('pays the price, owns the hull and selects it', () => {
    const m = model(1000);
    const r = buyAndSelectHull({ store: m.store, model: m }, 'wisp');
    expect(r.ok).toBe(true);
    expect(m.store.data.credits).toBe(1000 - HULLS.wisp.price);
    expect(m.store.data.ownedHulls).toContain('wisp');
    expect(m.hullId).toBe('wisp');
    expect(m.grid.hullId).toBe('wisp');
  });

  it('with too few credits nothing is bought or selected', () => {
    const m = model(HULLS.wisp.price - 1);
    const r = buyAndSelectHull({ store: m.store, model: m }, 'wisp');
    expect(r).toEqual({ ok: false, error: 'Not enough credits' });
    expect(m.store.data.credits).toBe(HULLS.wisp.price - 1);
    expect(m.store.data.ownedHulls).not.toContain('wisp');
    expect(m.hullId).toBe('dart');
  });

  it('an owned or unknown hull cannot be bought again', () => {
    const m = model(10_000_000);
    expect(buyAndSelectHull({ store: m.store, model: m }, 'dart').ok).toBe(false);
    expect(buyAndSelectHull({ store: m.store, model: m }, 'nope').ok).toBe(false);
    expect(m.store.data.credits).toBe(10_000_000);
  });

  it('the picker rows: price order, owned flags, the dot only on an unowned hull that can be paid', () => {
    const rows = hullRows(['dart', 'twin'], 'twin', 800);
    expect(rows.map(r => r.id)).toEqual([...HULL_ORDER]);
    expect(rows.find(r => r.id === 'twin')).toMatchObject({ owned: true, current: true, dot: false });
    expect(rows.filter(r => r.dot).map(r => r.id)).toEqual(['prong', 'wisp']);
    expect(hullRows(['dart'], 'dart', 0).some(r => r.dot)).toBe(false);
    expect(hullRows(['dart'], 'dart', 5_000_000).filter(r => !r.owned).every(r => r.dot)).toBe(true);
  });
});

describe('affordability dot', () => {
  const base = { credits: 100, copyPrice: 100, owned: 0, cap: 5, locked: false };
  it('shows when the next copy is affordable and under the cap and not locked', () => {
    expect(copyAffordable(base)).toBe(true);
    expect(copyAffordable({ ...base, credits: 99 })).toBe(false);          // cannot pay
    expect(copyAffordable({ ...base, owned: 5 })).toBe(false);             // at the cap
    expect(copyAffordable({ ...base, owned: 4 })).toBe(true);              // one below the cap
    expect(copyAffordable({ ...base, locked: true })).toBe(false);         // locked
    expect(copyAffordable({ ...base, cap: Infinity, owned: 1000 })).toBe(true);
  });
  it('hulls: only for an unowned hull the player can pay', () => {
    expect(hullAffordable(false, 700, 700)).toBe(true);
    expect(hullAffordable(false, 699, 700)).toBe(false);
    expect(hullAffordable(true, 10_000, 700)).toBe(false);
  });
});

describe('saves with the bigger ladder', () => {
  it('keep the version (the shape did not change), keep owned Fan and Shuttle, ignore unknown hull ids, accept new ones', () => {
    const raw = { ...defaultProgress(), ownedHulls: ['dart', 'fan', 'shuttle', 'wisp', 'zenith', 'not_a_hull', 7] };
    const p = loadProgress(JSON.stringify(raw));
    expect(p.version).toBe(PROGRESS_VERSION);
    expect(PROGRESS_VERSION).toBe(12);
    expect(p.ownedHulls.sort()).toEqual(['dart', 'fan', 'shuttle', 'wisp', 'zenith'].sort());
    expect(richProgress().ownedHulls.length).toBe(19);
  });
  it('a v8 save with only the old five hulls loads unchanged', () => {
    const old = { ...defaultProgress(), credits: 321, ownedHulls: ['dart', 'twin', 'prong', 'fan', 'shuttle'] };
    const p = loadProgress(JSON.stringify(old));
    expect(p.ownedHulls).toEqual(['dart', 'twin', 'prong', 'fan', 'shuttle']);
    expect(p.credits).toBe(321);
  });
});

describe('number formats', () => {
  it('999.96 does not print as 1000.0', () => {
    expect(fmtDamage(999.96)).toBe('1K');
    expect(fmtDamage(999.4)).toBe('999.4');
    expect(fmtDamage(1234)).toBe('1.23K');
  });
});
