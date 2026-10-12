import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { describeBlock } from '../src/engine/compilerTypes';
import { compile } from '../src/engine/compiler';
import { rng } from '../src/rng';
import { World } from '../src/game/world';
import { buildFanGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { buildStarterGrid } from '../src/game/starter';
import { PointerState } from '../src/input';
import { freeFlyRewardTier } from '../src/data/waves';
import { rockReward } from '../src/econ/economy';
import { MitosisEnemy } from '../src/engine/mitosis';
import { PROJECTILE_MAX_AGE, WALL_COLS } from '../src/wall/constants';
import { LevelDef } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';
import { bounceCount, cleaverBonus, cleaverPenalty, WELL_RADIUS } from '../src/engine/effects';

const DT = 1 / 60;
const VW = CONFIG.VIEW.W;
const idle: PointerState = { x: 0, y: 0, active: false, type: 'mouse', seen: false };
type Mod = { type: string; level?: number };

// ------------------------------------------------------------------ Free Fly helpers
/** A Free Fly world with no director, the ship parked far right so its own shots never reach the rocks under test. */
function ff() {
  const w = new World({ autoSpawn: false });
  w.shipX = 520; w.shipY = 900;
  w.hull = 1e9;
  return w;
}
const rock = (w: World, x: number, y: number, hp: number, o: { maxHp?: number; generation?: number; defId?: string } = {}) => {
  const e = w.spawnSpecies(o.defId ?? 'mitotic_rock', x, y, { hp, radius: 20, generation: o.generation ?? 1 })!;
  if (o.maxHp) e.maxHp = o.maxHp;
  return e;
};
/** Drops a stationary projectile with `mods` on the rock and runs one step: one hit through the real pipeline. */
function shootRock(w: World, e: MitosisEnemy, dmg: number, mods: Mod[] = []) {
  w.projSys.modifiersTable = [...w.projSys.modifiersTable, mods];
  const i = w.pool.spawn(e.x, e.y, 0, 0, dmg, 0, w.projSys.modifiersTable.length - 1);
  w.projSys.init(i);
  w.update(DT, idle);
  return i;
}
/** Live projectiles of one modifier-table entry (the ship's own shots reuse freed pool slots, so an index alone is not enough). */
const liveOf = (w: World, mi: number) => { let n = 0; for (let k = 0; k < w.pool.max; k++) if (w.pool.active[k] && w.pool.modIndex[k] === mi) n++; return n; };
const run = (w: World, seconds: number, onStep?: () => void) => { for (let k = 0; k < Math.round(seconds / DT); k++) { w.update(DT, idle); onStep?.(); } };

// ------------------------------------------------------------------ wall helpers
const plainBlock = (hp = 1e6) => ({ hp, armor: 0, shield: 0 });
function wallLevel(rows: number, f: (r: number, c: number) => { hp: number; armor: number; shield: number } | null, wrap = true): LevelDef {
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < WALL_COLS; c++) cells.push(f(r, c));
  return { tier: 1, cols: WALL_COLS, rows, cells, approachSpeed: 0, wrap };
}
function wall(l: LevelDef): WallWorld {
  const w = new WallWorld(l, { grid: buildStarterGrid() });
  w.autoFire = false;
  w.setWallOffset(300);
  return w;
}
function shootAt(w: WallWorld, x: number, y: number, dmg: number, mods: Mod[], v: { vx?: number; vy?: number } = {}) {
  w.projSys.modifiersTable = [mods];
  const i = w.pool.spawn(x, y, v.vx ?? 0, v.vy ?? 0, dmg, 0, 0);
  w.projSys.init(i);
  return i;
}

// ================================================================== the nine blocks
describe('Mitosis category and block data', () => {
  const NEW = ['fission_catalyst', 'cauterize', 'cleaver', 'culling_bolt', 'residue_seed', 'overkill_spill', 'gravity_well', 'static_charge', 'random_router'];
  it.each(NEW)('%s: shown, shop-unlocked, priced by rarity, at least 4 levels, text with the current numbers', (id) => {
    const b = BLOCKS[id];
    expect(b.shown && b.unlock === 'shop' && b.rarity && b.baseCost).toBeTruthy();
    expect(b.maxLevel).toBeGreaterThanOrEqual(4);
    expect(pickerBlocks().some(p => p.id === id)).toBe(true);
    expect(describeBlock(b, 1)).not.toBe(describeBlock(b, 2));
    expect(describeBlock(b, 1)).toMatch(/\d/);
  });
  it('the six mitosis blocks form their own category; the rock-only ones say so in the inspector', () => {
    expect(pickerBlocks().filter(b => b.category === 'mitosis').map(b => b.id).sort())
      .toEqual(['cauterize', 'cleaver', 'culling_bolt', 'fission_catalyst', 'overkill_spill', 'residue_seed']);
    for (const id of ['fission_catalyst', 'cauterize', 'cleaver', 'overkill_spill', 'gravity_well']) expect(describeBlock(BLOCKS[id], 1)).toMatch(/Free Fly rocks only/);
    for (const id of ['culling_bolt', 'residue_seed', 'static_charge']) expect(describeBlock(BLOCKS[id], 1)).toMatch(/wall blocks/);
  });
});

describe('Fission Catalyst', () => {
  it('a hit that does not kill splits the rock at once; the children share the remaining HP; a cooldown stops a second forced split', () => {
    const w = ff();
    const e = rock(w, 200, 300, 1000);
    shootRock(w, e, 100, [{ type: 'fission_catalyst', level: 1 }]);
    expect(w.mitosis.enemies.includes(e)).toBe(false);
    const kids = w.mitosis.enemies;
    expect(kids.length).toBe(2);
    expect(kids.every(k => k.generation === 2 && Math.abs(k.hp - 450) < 1e-6)).toBe(true); // (1000 - 100) / 2
    expect(w.fx.fissionSplits).toBe(1);
    expect(w.kills).toBe(0);
    // Straight away again: the child is on cooldown.
    shootRock(w, kids[0], 10, [{ type: 'fission_catalyst', level: 1 }]);
    expect(w.mitosis.enemies.length).toBe(2);
    expect(w.fx.fissionBlocked).toBe(1);
    // After the cooldown (1.0 s at level 1) it splits again.
    run(w, 1.1);
    const c = w.mitosis.enemies.find(k => k.hp > 0)!;
    shootRock(w, c, 10, [{ type: 'fission_catalyst', level: 1 }]);
    expect(w.fx.fissionSplits).toBe(2);
    expect(w.mitosis.enemies.some(k => k.generation === 3)).toBe(true);
  });
  it('does nothing on species that cannot split (Darter, Budder) and on cauterized rocks', () => {
    const w = ff();
    const d = rock(w, 100, 300, 1000, { defId: 'darter' });
    shootRock(w, d, 100, [{ type: 'fission_catalyst', level: 1 }]);
    expect(w.mitosis.enemies.includes(d) && d.hp === 900).toBe(true);
    const b = rock(w, 300, 300, 1000, { defId: 'budder' });
    shootRock(w, b, 100, [{ type: 'fission_catalyst', level: 1 }]);
    expect(w.mitosis.enemies.includes(b)).toBe(true);
    const c = rock(w, 450, 300, 1000);
    shootRock(w, c, 100, [{ type: 'fission_catalyst', level: 1 }, { type: 'cauterize', level: 1 }]);
    expect(w.mitosis.enemies.includes(c)).toBe(true);
    expect(w.fx.fissionSplits).toBe(0);
  });
});

describe('Cauterize', () => {
  it('a hit rock cannot split for 3 s; a kill inside the window leaves no children and pays +25%; after it the rock splits normally', () => {
    const base = () => {
      const w = ff();
      const e = rock(w, 200, 300, 400);
      return { w, e };
    };
    const control = base();
    shootRock(control.w, control.e, 5000);
    expect(control.w.mitosis.enemies.length).toBe(0); // overkill spill kills the children outright: use a gentler kill below
    const kill = (cauterize: boolean) => {
      const { w, e } = base();
      e.hp = 100; e.maxHp = 1000;
      if (cauterize) shootRock(w, e, 1, [{ type: 'cauterize', level: 1 }]);
      const before = w.creditsExact;
      shootRock(w, e, 100);
      return { kids: w.mitosis.enemies.length, paid: w.creditsExact - before, w, e };
    };
    const plain = kill(false), caut = kill(true);
    expect(plain.kids).toBe(2);
    expect(caut.kids).toBe(0);
    expect(caut.paid / plain.paid).toBeCloseTo(1.25, 6);
    expect(plain.paid).toBeCloseTo(rockReward(freeFlyRewardTier(1), 1), 9);
    expect(caut.w.fx.cauterizedKills).toBe(1);
    // After 3 s the mark is gone.
    const late = base();
    late.e.hp = 100; late.e.maxHp = 1000;
    shootRock(late.w, late.e, 1, [{ type: 'cauterize', level: 1 }]);
    run(late.w, 3.1);
    shootRock(late.w, late.e, 100);
    expect(late.w.mitosis.enemies.length).toBe(2);
  });
});

describe('Cleaver', () => {
  it.each([[1], [5]])('damage ratio by generation at level %i: parents x penalty, fragments x bonus, wall blocks untouched', (lvl) => {
    const dealt = (generation: number) => {
      const w = ff();
      const e = rock(w, 200, 300, 1e6, { generation });
      shootRock(w, e, 100, [{ type: 'cleaver', level: lvl }]);
      return 1e6 - e.hp;
    };
    expect(dealt(1)).toBeCloseTo(100 * cleaverPenalty(lvl), 6);
    expect(dealt(2)).toBeCloseTo(100 * cleaverBonus(lvl), 6);
    expect(dealt(4)).toBeCloseTo(100 * cleaverBonus(lvl), 6);
    expect(cleaverBonus(1)).toBe(2);
    expect(cleaverPenalty(1)).toBe(0.9);
    const ww = wall(wallLevel(3, () => plainBlock(1000)));
    const b = ww.blocks[1 * WALL_COLS + 4]!;
    shootAt(ww, b.x, b.y, 100, [{ type: 'cleaver', level: lvl }]);
    ww.update(DT, null);
    expect(1000 - b.hp).toBeCloseTo(100, 6);
  });
});

describe('Culling Bolt', () => {
  it('adds 4% of max HP (+1% a level), capped at 6x the packet; also on wall blocks', () => {
    const dealt = (maxHp: number, lvl: number) => {
      const w = ff();
      const e = rock(w, 200, 300, maxHp, { maxHp });
      shootRock(w, e, 100, [{ type: 'culling_bolt', level: lvl }]);
      return maxHp - e.hp;
    };
    expect(dealt(2000, 1)).toBeCloseTo(100 + 80, 6);      // 4% of 2000
    expect(dealt(2000, 3)).toBeCloseTo(100 + 120, 6);     // 6% of 2000
    expect(dealt(100000, 1)).toBeCloseTo(100 + 600, 6);   // 4% would be 4000: capped at 6 x 100
    const ww = wall(wallLevel(3, () => plainBlock(2000)));
    const b = ww.blocks[1 * WALL_COLS + 4]!;
    shootAt(ww, b.x, b.y, 100, [{ type: 'culling_bolt', level: 1 }]);
    ww.update(DT, null);
    expect(2000 - b.hp).toBeCloseTo(180, 6);
  });
});

describe('Residue Seed', () => {
  it('a kill leaves a 40 px cloud for 2.5 s that ticks 40% of the killing hit every 0.5 s, children included', () => {
    const w = ff();
    const e = rock(w, 200, 300, 400, { maxHp: 400 });
    shootRock(w, e, 400, [{ type: 'residue_seed', level: 1 }]);
    expect(w.projSys.fx.residueClouds).toBe(1);
    const kids = [...w.mitosis.enemies];
    expect(kids.length).toBe(2);
    const hp0 = kids.map(k => k.hp);
    expect(hp0.every(h => Math.abs(h - 220) < 1e-6)).toBe(true);
    run(w, 0.55);
    expect(w.projSys.fx.residueTicks).toBe(2); // one tick, both children inside
    expect(kids.every((k, i) => Math.abs(hp0[i] - k.hp - 160) < 1e-6)).toBe(true); // 40% of 400
    run(w, 0.5);
    expect(w.projSys.fx.residueTicks).toBeGreaterThanOrEqual(3); // a second tick (the rocks drift on and one soon leaves the cloud)
    run(w, 2.5);                                                  // the cloud is over (2.5 s in all)
    const after = w.projSys.fx.residueTicks;
    run(w, 1);
    expect(w.projSys.fx.residueTicks).toBe(after);
    expect(w.projSys.cloudT.every(t => t <= 0)).toBe(true);
  });
  it('works on wall blocks: the cloud stays where the block died and hurts its neighbours', () => {
    const ww = wall(wallLevel(3, () => plainBlock(100)));
    const b = ww.blocks[1 * WALL_COLS + 4]!;
    const n = ww.blocks[1 * WALL_COLS + 5]!;
    shootAt(ww, b.x, b.y, 200, [{ type: 'residue_seed', level: 1 }]);
    ww.update(DT, null);
    expect(ww.blocks[1 * WALL_COLS + 4]).toBeNull();
    for (let k = 0; k < 35; k++) ww.update(DT, null);
    expect(n.hp).toBeCloseTo(100 - 80, 4); // one tick of 40% of 200 on the neighbour inside the cloud
  });
});

describe('Overkill Spill', () => {
  it('carries 50% of the excess (+10% a level, up to 100%) to the children on top of the split\'s own 100%', () => {
    const childHp = (mods: Mod[]) => {
      const w = ff();
      const e = rock(w, 200, 300, 100, { maxHp: 1000 });
      shootRock(w, e, 140, mods); // 40 beyond its HP
      return w.mitosis.enemies.map(k => k.hp);
    };
    expect(childHp([])).toEqual([530, 530]);                                     // 550 - 40 / 2, as before this chunk
    expect(childHp([{ type: 'overkill_spill', level: 1 }])).toEqual([520, 520]); // + 50% of 40, spread over 2
    expect(childHp([{ type: 'overkill_spill', level: 6 }])).toEqual([510, 510]); // + 100%
  });
});

describe('Gravity Well', () => {
  it('pulls rocks within 120 px toward the impact for 1.5 s and then stops; rocks farther away are not pulled', () => {
    const w = ff();
    const a = rock(w, 200, 300, 1e9);
    const near = rock(w, 290, 300, 1e9);     // 90 px away
    const far = rock(w, 440, 300, 1e9);      // 240 px away
    shootRock(w, a, 10, [{ type: 'gravity_well', level: 1 }]);
    expect(w.projSys.fx.wellsMade).toBe(1);
    const x1 = near.x, f1 = far.x;
    run(w, 0.4);
    expect(x1 - near.x).toBeGreaterThan(25);           // pulled left, towards the well (120 px/s)
    expect(Math.abs(far.x - f1)).toBeLessThan(15);     // only its own sway
    run(w, 1.3);
    const x2 = near.x;
    run(w, 1);
    expect(Math.abs(near.x - x2)).toBeLessThan(40);    // no pull any more: only sway and the drift
    expect(w.projSys.wellT.every(t => t <= 0)).toBe(true);
    expect(WELL_RADIUS).toBe(120);
  });
  it('can never drag a rock off the screen: 120 s of wells everywhere, edges and above the top', () => {
    const w = new World({ autoSpawn: true, seed: 5 });
    w.shipX = 520; w.shipY = 900; w.hull = 1e9;
    w.projSys.modifiersTable = [...w.projSys.modifiersTable, [{ type: 'gravity_well', level: 5 }]];
    const mi = w.projSys.modifiersTable.length - 1;
    let worst = 0;
    for (let i = 0; i < 120 * 60; i++) {
      w.hull = 1e9;
      if (i % 90 === 0) for (const [x, y] of [[0, -20], [VW, 60], [VW / 2, -30], [3, 400], [VW - 3, 500]]) w.spawnSpecies('mitotic_rock', x, y, { hp: 1e9 });
      if (i % 12 === 0 && w.mitosis.enemies.length) {
        // A shot lands on one of the rocks (edge and above-the-top ones included): that is a well at that spot.
        const e = w.mitosis.enemies[(i / 12) % w.mitosis.enemies.length | 0];
        const j = w.pool.spawn(e.x, e.y, 0, 0, 1, 0, mi);
        w.projSys.init(j);
      }
      w.update(DT, idle);
      for (const e of w.mitosis.enemies) worst = Math.max(worst, e.radius - e.x, e.x + e.radius - VW);
    }
    expect(w.projSys.fx.wellsMade).toBeGreaterThan(100);
    expect(w.fx.wellPulls).toBeGreaterThan(100);
    expect(worst).toBeLessThanOrEqual(1e-6);
  });
});

describe('Static Charge', () => {
  it('the 3rd hit within 2 s releases an extra pulse of 150% of the hit; the count then starts over; a slow trickle never pulses', () => {
    const w = ff();
    const e = rock(w, 200, 300, 10000);
    const mods = [{ type: 'static_charge', level: 1 }];
    const lost = () => 10000 - e.hp;
    shootRock(w, e, 100, mods); shootRock(w, e, 100, mods);
    expect(lost()).toBeCloseTo(200, 6);
    shootRock(w, e, 100, mods);
    expect(lost()).toBeCloseTo(200 + 100 + 150, 6);
    expect(w.projSys.fx.staticPulses).toBe(1);
    shootRock(w, e, 100, mods);                         // the count is back at 1
    expect(lost()).toBeCloseTo(550, 6);
    const slow = ff();
    const s = rock(slow, 200, 300, 10000);
    for (let k = 0; k < 4; k++) { shootRock(slow, s, 100, mods); run(slow, 1.2); s.y = 300; }
    expect(slow.projSys.fx.staticPulses).toBe(0);
    const ww = wall(wallLevel(3, () => plainBlock(10000)));
    const b = ww.blocks[1 * WALL_COLS + 4]!;
    for (let k = 0; k < 3; k++) { shootAt(ww, b.x, b.y, 100, mods); ww.update(DT, null); }
    expect(10000 - b.hp).toBeCloseTo(450, 6);
  });
});

describe('Random Router', () => {
  /** A Fan with the router in the middle and a turn on each side leading to a Flat+ and an ejector, as balance-econ builds it. */
  const fanWithRouter = (level: number) => {
    const g = buildFanGrid();
    place(g, 5, 9, 'random_router', level);
    place(g, 2, 9, 'turn_r'); place(g, 8, 9, 'turn_l');
    place(g, 2, 5, 'flat_plus'); place(g, 8, 5, 'flat_plus');
    return g;
  };
  const pulses = (level: number, seed: number, n: number) => {
    rng.reset(seed);
    const w = new World({ grid: fanWithRouter(level), autoSpawn: false });
    const seq: string[] = [];
    for (let i = 0; i < n; i++) {
      w.pool.active.fill(0); w.pool.count = 0;
      w.fire();
      let l = 0, r = 0;
      for (let k = 0; k < w.pool.max; k++) if (w.pool.active[k]) { if (w.pool.modIndex[k] === 0) l++; else r++; }
      seq.push(`${l}${r}`);
    }
    return { seq, w };
  };
  it('is seeded: the same seed gives the same sequence, another seed another; each pulse sends one packet left or right at 50/50 on level 1', () => {
    const a = pulses(1, 7, 2000), b = pulses(1, 7, 2000), c = pulses(1, 8, 2000);
    expect(a.seq).toEqual(b.seq);
    expect(a.seq).not.toEqual(c.seq);
    expect(a.seq.every(s => s === '10' || s === '01')).toBe(true);
    const left = a.seq.filter(s => s === '10').length / 2000;
    expect(left).toBeGreaterThan(0.46);
    expect(left).toBeLessThan(0.54);
    expect(a.w.gun.fx.routerBoth).toBe(0);
    expect(compile(fanWithRouter(1)).stats.projectilesPerPulse).toBeCloseTo(1, 9);
  });
  it('level 5: 40% of pulses take both outputs (so 1.4 projectiles per pulse), the rest split evenly', () => {
    const a = pulses(5, 11, 4000);
    const both = a.seq.filter(s => s === '11').length / 4000;
    expect(both).toBeGreaterThan(0.36);
    expect(both).toBeLessThan(0.44);
    expect(compile(fanWithRouter(5)).stats.projectilesPerPulse).toBeCloseTo(1.4, 9);
    const one = a.seq.filter(s => s !== '11');
    const left = one.filter(s => s === '10').length / one.length;
    expect(left).toBeGreaterThan(0.45);
    expect(left).toBeLessThan(0.55);
  });
});

// ================================================================== Bouncing (chunk 11a, step L1b)
describe('Bouncing: bounces off whatever it hits', () => {
  /** A closed box of plain blocks round a two-column gap: a shot fired into one side keeps hitting walls whatever its heading. */
  const corridor = () => wall(wallLevel(5, (r, c) => ((r === 0 || r === 4) && c <= 13) || (r > 0 && r < 4 && (c <= 5 || (c >= 8 && c <= 13))) ? plainBlock() : null, false));
  const bounceRun = (level: number, seed: number) => {
    rng.reset(seed);
    const w = corridor();
    const gap = w.blocks[2 * WALL_COLS + 8]!;
    const i = shootAt(w, gap.x - 60, gap.y, 50, [{ type: 'bouncing', level }], { vx: 600, vy: 0 });
    let hits = 0, steps = 0;
    while (w.pool.active[i] && steps < 600) { w.update(DT, null); hits += w.hits.length; w.hits.length = 0; steps++; }
    return { hits, bounces: w.projSys.fx.bounces, steps, alive: !!w.pool.active[i] };
  };
  it('hits a plain wall block, bounces, and hits again; it is stopped by the (N+1)th hit: 2 bounces at level 1, 4 at level 3', () => {
    expect(bounceCount(1)).toBe(2);
    expect(bounceCount(3)).toBe(4);
    for (const seed of [1, 2, 3]) {
      const l1 = bounceRun(1, seed), l3 = bounceRun(3, seed);
      expect([l1.bounces, l1.hits, l1.alive]).toEqual([2, 3, false]);
      expect([l3.bounces, l3.hits, l3.alive]).toEqual([4, 5, false]);
      expect(l3.steps / 60).toBeLessThan(PROJECTILE_MAX_AGE); // well inside the age cap
    }
  });
  it('without the block the same shot is used up by its first hit', () => {
    const w = corridor();
    const gap = w.blocks[2 * WALL_COLS + 8]!;
    const i = shootAt(w, gap.x - 60, gap.y, 50, [], { vx: 600, vy: 0 });
    for (let k = 0; k < 30; k++) w.update(DT, null);
    expect(w.pool.active[i]).toBe(0);
    expect(w.projSys.fx.bounces).toBe(0);
  });
  it('a bounce keeps speed and full damage, turns by the contact normal plus at most 35 degrees, and the shot moves away from the surface', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      rng.reset(seed);
      const w = corridor();
      const gap = w.blocks[2 * WALL_COLS + 8]!;
      const i = shootAt(w, gap.x - 60, gap.y, 50, [{ type: 'bouncing', level: 1 }], { vx: 600, vy: 0 });
      let k = 0;
      while (w.projSys.fx.bounces === 0 && k++ < 60) w.update(DT, null);
      expect(w.projSys.fx.bounces).toBe(1);
      expect(Math.hypot(w.pool.vx[i], w.pool.vy[i])).toBeCloseTo(600, 2);
      expect(w.pool.damage[i]).toBe(50);
      expect(w.pool.vx[i]).toBeLessThan(0);                                    // heading back west
      expect(Math.abs(Math.atan2(w.pool.vy[i], -w.pool.vx[i]))).toBeLessThanOrEqual((35 * Math.PI) / 180 + 1e-3);
    }
  });
  it('Free Fly: bounces off a screen edge (no damage) and keeps going; it is freed once the bounces are used', () => {
    rng.reset(1);
    const w = ff();
    w.projSys.modifiersTable = [...w.projSys.modifiersTable, [{ type: 'bouncing', level: 1 }]];
    const i = w.pool.spawn(6, 500, -600, 0, 50, 0, w.projSys.modifiersTable.length - 1);
    w.projSys.init(i);
    w.update(DT, idle);
    const mi = w.projSys.modifiersTable.length - 1;
    expect(liveOf(w, mi)).toBe(1);
    expect(w.pool.vx[i]).toBeGreaterThan(0);
    expect(w.projSys.fx.edgeBounces).toBe(1);
    expect(w.hits.length).toBe(0);
    run(w, 3);
    expect(w.projSys.fx.edgeBounces).toBe(2);   // right edge, then it leaves through the left (no bounces left)
    expect(liveOf(w, mi)).toBe(0);
  });
  it('Free Fly: ricochets off a plain rock and off an armored rock, at full damage', () => {
    for (const armor of [0, 10]) {
      rng.reset(3);
      const w = ff();
      const e = rock(w, 200, 300, 1e9);
      e.armor = armor;
      const mi = w.projSys.modifiersTable.length;
      w.projSys.modifiersTable = [...w.projSys.modifiersTable, [{ type: 'bouncing', level: 1 }]];
      const i = w.pool.spawn(200, 300 + 25, 0, -600, 40, 0, mi);
      w.projSys.init(i);
      w.update(DT, idle);
      expect(w.pool.active[i]).toBe(1);
      expect(w.pool.vy[i]).toBeGreaterThan(0);
      expect(w.pool.damage[i]).toBe(40);
      expect(e.hp).toBeLessThan(1e9);
    }
  });
  it('Piercing first: a pierce that leaves damage keeps the shot flying with its bounces; one that would use it up becomes a bounce at full damage', () => {
    const run1 = (pierceLevel: number) => {
      rng.reset(2);
      const w = ff();
      const e = rock(w, 200, 300, 1e9);
      const mi = w.projSys.modifiersTable.length;
      w.projSys.modifiersTable = [...w.projSys.modifiersTable, [{ type: 'piercing', level: pierceLevel }, { type: 'bouncing', level: 1 }]];
      const i = w.pool.spawn(200, 300 + 25, 0, -600, 100, 0, mi);
      w.projSys.init(i);
      w.update(DT, idle);
      return { w, i, e };
    };
    const strong = run1(1);   // level 1: a hit costs the damage it dealt: used up -> bounce, damage restored
    expect(strong.w.pool.active[strong.i]).toBe(1);
    expect(strong.w.pool.damage[strong.i]).toBe(100);
    expect(strong.w.projSys.fx.bounces).toBe(1);
    const weak = run1(5);     // level 5: costs 1/5: 80 left, still piercing, no bounce used
    expect(weak.w.pool.damage[weak.i]).toBeCloseTo(80, 4);
    expect(weak.w.projSys.fx.bounces).toBe(0);
    expect(weak.w.pool.bounces[weak.i]).toBe(2);
  });
  it('never loops for ever or sits still: a shot carrying the block is freed at the age cap, and nothing is left after a long run', () => {
    const w = ff();
    w.projSys.modifiersTable = [...w.projSys.modifiersTable, [{ type: 'bouncing', level: 5 }]];
    const i = w.pool.spawn(270, 500, 0, -600, 10, 0, w.projSys.modifiersTable.length - 1);
    w.projSys.init(i);
    const mi = w.projSys.modifiersTable.length - 1;
    w.pool.age[i] = PROJECTILE_MAX_AGE + 0.01;
    w.update(DT, idle);
    expect(liveOf(w, mi)).toBe(0);
    // A shot with the most bounces possible in a world with edges on all four sides is gone within a few seconds.
    const j = w.pool.spawn(270, 500, 300, -500, 10, 0, mi);
    w.projSys.init(j);
    run(w, 4);
    expect(liveOf(w, mi)).toBe(0);
  });
});
