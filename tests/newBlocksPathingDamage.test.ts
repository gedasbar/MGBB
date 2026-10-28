import { describe, it, expect } from 'vitest';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { BASE_PRICE } from '../src/econ/economy';
import { BLOCK_ECONOMY } from '../src/data/blockEconomy';
import { defaultProgress, sanitizeProgress } from '../src/econ/progress';
import { compile, Grid } from '../src/engine/compiler';
import { describeBlock, Modifier } from '../src/engine/compilerTypes';
import { ProjectilePool } from '../src/engine/pools';
import { ARC_MAX, EnemyEntity, PHASE_MINE_WAIT, PHASE_NORMAL, ProjectileSystem } from '../src/engine/projectiles';
import { SpatialHash } from '../src/engine/spatialHash';
import { Gun, spawnOffsetsFor } from '../src/game/fire';
import { buildFanGrid, buildTwinGrid } from '../src/game/gridUtils';
import { buildStarterGrid, place } from '../src/game/starter';
import { World } from '../src/game/world';
import { PointerState } from '../src/input';
import { WALL_COLS } from '../src/wall/constants';
import { LevelDef } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';

/**
 * Chunk 9a: the twelve new blocks. One table, one row per block: a small deterministic sim proving what the inspector text
 * promises (`fly`), and a run of the real WallWorld loop with the block in a real circuit (`wall`). The effects live in the
 * shared hit pipeline and the Gun, so a counter that moves in the Wall run means the same code ran there.
 */

// ---------------------------------------------------------------- harness
const DT = 1 / 60;

/** Projectiles, rocks, the shared hit pipeline and a step() in the same order as World.update. */
function rig() {
  const pool = new ProjectilePool(256);
  const sys = new ProjectileSystem(pool);
  const enemies: EnemyEntity[] = [];
  const hash = new SpatialHash(540, 960, 64);
  let nextId = 1;
  const rock = (x: number, y: number, hp = 100000, o: { armor?: number; maxHp?: number; radius?: number } = {}) => {
    const e: EnemyEntity = { id: nextId++, x, y, radius: o.radius ?? 20, hp, maxHp: o.maxHp ?? hp, armor: o.armor ?? 0, shield: 0, maxShield: 0 };
    enemies.push(e);
    return e;
  };
  const launch = (mods: Modifier[], x: number, y: number, vx: number, vy: number, damage = 100, ship = { x, y }) => {
    sys.modifiersTable = [mods];
    sys.shipX = ship.x;
    sys.shipY = ship.y;
    const i = pool.spawn(x, y, vx, vy, damage, 0, 0);
    sys.init(i);
    return i;
  };
  const step = (n = 1, dt = DT) => {
    for (let k = 0; k < n; k++) {
      sys.steer(dt, enemies);
      for (let i = 0; i < pool.max; i++) if (pool.active[i]) { pool.x[i] += pool.vx[i] * dt; pool.y[i] += pool.vy[i] * dt; }
      sys.updateStatus(dt);
      hash.clear();
      for (const e of enemies) hash.insert(e.id, e.x, e.y);
      sys.processHits(enemies, hash, 1);
    }
  };
  const hits: { id: number; dmg: number; kind: number }[] = [];
  sys.onHit = (e, d, _x, _y, kind = 0) => { hits.push({ id: e.id, dmg: d, kind }); };
  return { pool, sys, enemies, rock, launch, step, hits };
}
const taken = (e: EnemyEntity, from = 100000) => from - e.hp;
const mod = (type: string, level = 1): Modifier => ({ type, level });
const arcsLive = (sys: ProjectileSystem) => Array.from(sys.arcT).filter(t => t > 0).length;

/** A Gun on a compiled grid; fires and reports what left, per recipe. */
function gunRig(grid: Grid) {
  const c = compile(grid);
  const pool = new ProjectilePool(256);
  const sys = new ProjectileSystem(pool);
  sys.modifiersTable = c.recipes.map(r => r.packet.mods);
  const gun = new Gun(pool, sys, c.recipes, spawnOffsetsFor(c.recipes, grid), 0.25);
  const shot = () => {
    const out: { ri: number; damage: number }[] = [];
    for (let i = 0; i < pool.max; i++) if (pool.active[i]) out.push({ ri: pool.modIndex[i], damage: pool.damage[i] });
    pool.active.fill(0);
    pool.count = 0;
    return out;
  };
  return { c, pool, sys, gun, shot };
}

/** Twin hull with blocks placed in path order: the first id is the cell next to the generator. */
function twin(...ids: [string, number?][]): Grid {
  const g = buildTwinGrid();
  ids.forEach(([id, lv], k) => place(g, 1, 3 - k, id, lv ?? 1));
  return g;
}

/** A small wall: `rows` rows of 21 plain blocks of `hp`, parked at the screen so its bottom edge is at `bottom`. */
function wallLevel(rows: number, hp: number, armor = 0, approachSpeed = 0): LevelDef {
  const cells = new Array(rows * WALL_COLS).fill(null).map(() => ({ hp, armor, shield: 0 }));
  return { tier: 1, cols: WALL_COLS, rows, cells, approachSpeed };
}

interface Row {
  id: string;
  /** Precise behaviour of the block against plain rocks / the gun. */
  fly: () => void;
  /** Real WallWorld run with the block in the circuit: returns the counter that must have moved. */
  wall: { grid: () => Grid; level?: () => LevelDef; seconds: number; count: (w: WallWorld) => number };
}

const starterWith = (id: string, level = 1) => { const g = buildStarterGrid(); place(g, 9, 5, id, level); return g; };
const fx = (w: WallWorld) => w.projSys.fx;

const ROWS: Row[] = [
  {
    id: 'alternator',
    fly: () => {
      const g = buildFanGrid();
      place(g, 5, 9, 'alternator');
      place(g, 2, 9, 'turn_r');
      place(g, 8, 9, 'turn_l');
      const { c, gun, shot } = gunRig(g);
      expect(c.recipes.length).toBe(2);
      const seq: number[] = [];
      for (let p = 0; p < 6; p++) {
        gun.fire(270, 800);
        const out = shot();
        expect(out.length, `pulse ${p}: exactly one projectile`).toBe(1);
        expect(out[0].damage).toBeCloseTo(2.2, 6); // x2.2 (fixed level 3) on a base damage of 1
        seq.push(out[0].ri);
      }
      expect(seq[0]).not.toBe(seq[1]);
      expect(seq).toEqual([seq[0], seq[1], seq[0], seq[1], seq[0], seq[1]]); // A, B, A, B
      // the strip: one projectile per pulse, x2.2 damage
      expect(c.stats.projectilesPerPulse).toBeCloseTo(1, 9);
      expect(c.stats.damagePerShot).toBeCloseTo(2.2, 9);
      const g5 = buildFanGrid();
      place(g5, 5, 9, 'alternator', 5);
      place(g5, 2, 9, 'turn_r');
      place(g5, 8, 9, 'turn_l');
      expect(compile(g5).recipes[0].packet.damage).toBeCloseTo(2.2, 6); // no upgrades since 16c-2: a stored level changes nothing
    },
    wall: { grid: () => { const g = buildFanGrid(); place(g, 5, 9, 'alternator'); place(g, 2, 9, 'turn_r'); place(g, 8, 9, 'turn_l'); return g; }, seconds: 3, count: w => w.gun.fx.alternations },
  },
  {
    id: 'delay_line',
    fly: () => {
      const { gun, pool, shot } = gunRig(twin(['delay_line', 3])); // a stored level 3 changes nothing: no upgrades, always 0.1 s
      gun.fire(270, 800);
      expect(pool.count).toBe(0); // held
      gun.update(0.09, 270, 800);
      expect(pool.count).toBe(0);
      gun.update(0.02, 270, 800); // 0.11 s >= 0.1 s
      expect(shot().length).toBe(1);
      // the rate of fire is untouched in the strip
      expect(compile(twin(['delay_line', 3])).stats.pulsesPerSecond).toBe(compile(twin()).stats.pulsesPerSecond);
    },
    wall: { grid: () => starterWith('delay_line', 2), seconds: 3, count: w => w.gun.fx.delayReleases },
  },
  {
    id: 'overclock',
    fly: () => {
      const { gun, pool, shot } = gunRig(twin(['flat_plus'], ['overclock']));
      const dmg: number[] = [];
      for (let n = 0; n < 60; n++) {
        gun.update(0.25, 270, 800);
        gun.fire(270, 800);
        dmg.push(shot()[0].damage);
      }
      expect(dmg[0]).toBeCloseTo(2, 4); // the first packet of a streak is unboosted
      expect(dmg[10]).toBeCloseTo(2 * 1.2, 3); // +2% per packet
      expect(dmg[50]).toBeCloseTo(4, 3); // capped at +100%
      expect(dmg[59]).toBeCloseTo(4, 3);
      // 1 s without a packet resets the streak
      gun.update(1.2, 270, 800);
      gun.fire(270, 800);
      expect(shot()[0].damage).toBeCloseTo(2, 4);
      expect(gun.fx.overclockResets).toBe(1);
      expect(pool.count).toBe(0);
      // the strip shows the average of an unbroken streak, between x1 and x2
      const avg = compile(twin(['flat_plus'], ['overclock'])).stats.damagePerShot / 2;
      expect(avg).toBeGreaterThan(1.4);
      expect(avg).toBeLessThan(1.7);
    },
    wall: { grid: () => starterWith('overclock'), seconds: 5, count: w => (w.gun.fx.overclockPeak > 1.05 ? 1 : 0) },
  },
  {
    id: 'capacitor',
    fly: () => {
      const { gun, shot, c } = gunRig(twin(['flat_plus'], ['capacitor']));
      const out: number[][] = [];
      for (let p = 0; p < 6; p++) { gun.fire(270, 800); out.push(shot().map(s => s.damage)); }
      expect(out).toEqual([[], [], [expect.closeTo(7.2, 3)], [], [], [expect.closeTo(7.2, 3)]]); // the sum of three 2s, +20% (fixed level 3)
      // same damage per second (+20% from the fixed level), one slower shot
      const plain = compile(twin(['flat_plus'])).stats;
      expect(c.stats.estDps).toBeCloseTo(plain.estDps * 1.2, 6);
      expect(c.stats.damagePerShot).toBeCloseTo(7.2, 6);
      expect(c.stats.pulsesPerSecond).toBeCloseTo(plain.pulsesPerSecond / 3, 9);
      expect(c.stats.projectilesPerPulse).toBeCloseTo(1, 9);
    },
    wall: { grid: () => starterWith('capacitor'), seconds: 3, count: w => w.gun.fx.capacitorEmits },
  },
  {
    id: 'executioner',
    fly: () => {
      const r = rig();
      const healthy = r.rock(100, 300, 1000);
      const wounded = r.rock(300, 300, 200, { maxHp: 1000 });
      const edge = r.rock(450, 300, 250, { maxHp: 1000 }); // exactly 25%: not below
      for (const e of [healthy, wounded, edge]) {
        r.launch([mod('executioner')], e.x, e.y, 0, 0, 100);
        r.step();
      }
      expect(taken(healthy, 1000)).toBeCloseTo(100, 6);
      expect(taken(wounded, 200)).toBeCloseTo(300, 6); // x3.0
      expect(taken(edge, 250)).toBeCloseTo(100, 6);
      // level 5: x4.0
      const r5 = rig();
      const w5 = r5.rock(100, 300, 200, { maxHp: 1000 });
      r5.launch([mod('executioner', 5)], 100, 300, 0, 0, 100);
      r5.step();
      expect(taken(w5, 200)).toBeCloseTo(400, 6);
    },
    wall: {
      grid: () => starterWith('executioner'),
      level: () => wallLevel(4, 40, 0, 0),
      seconds: 25,
      count: w => fx(w).executionerHits,
    },
  },
  {
    id: 'chain_lightning',
    fly: () => {
      const r = rig();
      const A = r.rock(100, 400);
      const B = r.rock(180, 400);
      const C = r.rock(260, 400);
      const D = r.rock(500, 400); // out of range of C
      r.launch([mod('chain_lightning')], 100, 400, 0, 0, 100);
      r.step();
      expect(taken(A)).toBeCloseTo(100, 6);
      expect(taken(B)).toBeCloseTo(70, 6);
      expect(taken(C)).toBeCloseTo(70, 6);
      expect(taken(D)).toBe(0);
      expect(r.hits.length).toBe(3); // exactly three targets
      expect(arcsLive(r.sys)).toBe(2);
      expect(r.sys.fx.chainJumps).toBe(2);
      // arcs last 0.12 s
      r.sys.updateStatus(0.13);
      expect(arcsLive(r.sys)).toBe(0);
      // level 3: three jumps
      const r3 = rig();
      const rocks = [100, 180, 260, 340].map(x => r3.rock(x, 400));
      r3.launch([mod('chain_lightning', 3)], 100, 400, 0, 0, 100);
      r3.step();
      expect(rocks.map(e => taken(e))).toEqual([expect.closeTo(100, 6), expect.closeTo(70, 6), expect.closeTo(70, 6), expect.closeTo(70, 6)]);
      expect(ARC_MAX).toBeGreaterThanOrEqual(8);
    },
    wall: { grid: () => starterWith('chain_lightning'), level: () => wallLevel(3, 6, 0, 0), seconds: 4, count: w => fx(w).chainJumps },
  },
  {
    id: 'boomerang',
    fly: () => {
      const r = rig();
      const target = r.rock(270, 650); // 150 px above the ship
      const ship = { x: 270, y: 800 };
      const i = r.launch([mod('boomerang')], 270, 800, 0, -600, 100, ship);
      let maxDist = 0;
      for (let f = 0; f < 150 && r.pool.active[i]; f++) {
        r.step();
        if (r.pool.active[i]) maxDist = Math.max(maxDist, 800 - r.pool.y[i]);
      }
      expect(maxDist).toBeGreaterThan(240);
      expect(maxDist).toBeLessThan(270); // range 250 at level 1
      expect(r.pool.active[i]).toBe(0); // gone at the ship
      expect(r.sys.fx.boomerangReturns).toBe(1);
      expect(taken(target)).toBeCloseTo(200, 6); // hit on the way out and on the way back
      // level 5 flies further
      const r5 = rig();
      const j = r5.launch([mod('boomerang', 5)], 270, 800, 0, -600, 100, ship);
      let far = 0;
      for (let f = 0; f < 200 && r5.pool.active[j]; f++) { r5.step(); if (r5.pool.active[j]) far = Math.max(far, 800 - r5.pool.y[j]); }
      expect(far).toBeGreaterThan(540);
    },
    wall: { grid: () => starterWith('boomerang'), seconds: 3, count: w => fx(w).boomerangReturns },
  },
  {
    id: 'orbit',
    fly: () => {
      const r = rig();
      const ship = { x: 270, y: 600 };
      const i = r.launch([mod('orbit')], 270, 600, 0, -600, 100, ship);
      let minD = 1e9;
      let maxD = 0;
      for (let f = 0; f < 50; f++) { // 0.83 s of the 1.0 s orbit
        r.step();
        if (f > 10) { const d = Math.hypot(r.pool.x[i] - ship.x, r.pool.y[i] - ship.y); minD = Math.min(minD, d); maxD = Math.max(maxD, d); }
      }
      expect(minD).toBeGreaterThan(58);
      expect(maxD).toBeLessThan(62);
      expect(r.pool.phase[i]).not.toBe(PHASE_NORMAL);
      r.step(15); // past 1.0 s: launched in its original direction (up)
      expect(r.pool.phase[i]).toBe(PHASE_NORMAL);
      expect(r.sys.fx.orbitLaunches).toBe(1);
      expect(r.pool.vy[i]).toBeCloseTo(-600, 3);
      expect(Math.abs(r.pool.vx[i])).toBeLessThan(1e-3);
      // it hits while orbiting, the same target at most once per 0.3 s
      const h = rig();
      const big = h.rock(270, 600, 100000, { radius: 200 }); // always touching the orbit
      h.launch([mod('orbit')], 270, 600, 0, -600, 10, ship);
      const times: number[] = [];
      for (let f = 0; f < 60; f++) {
        const before = h.hits.length;
        h.step();
        if (h.hits.length > before) times.push(f * DT);
      }
      expect(times.length).toBeGreaterThanOrEqual(3);
      expect(times.length).toBeLessThanOrEqual(4);
      for (let k = 1; k < times.length; k++) expect(times[k] - times[k - 1]).toBeGreaterThan(0.29);
      expect(big.hp).toBeLessThan(100000);
      // level 5: 2.0 s (1 + 0.25 a level)
      const r3 = rig();
      const j = r3.launch([mod('orbit', 5)], 270, 600, 0, -600, 100, ship);
      r3.step(110);
      expect(r3.pool.phase[j]).not.toBe(PHASE_NORMAL);
      r3.step(15);
      expect(r3.pool.phase[j]).toBe(PHASE_NORMAL);
    },
    wall: { grid: () => starterWith('orbit'), seconds: 4, count: w => fx(w).orbitLaunches },
  },
  {
    id: 'mine',
    fly: () => {
      const r = rig();
      const i = r.launch([mod('mine')], 270, 800, 0, -600, 100);
      r.step(40); // 0.67 s: 220 px at 600 px/s takes 0.37 s
      expect(r.pool.phase[i]).toBe(PHASE_MINE_WAIT);
      expect(r.pool.vx[i]).toBe(0);
      expect(r.pool.vy[i]).toBe(0);
      expect(800 - r.pool.y[i]).toBeCloseTo(220, 3);
      const y0 = r.pool.y[i];
      r.step(300); // 5 s later it has not moved or gone off
      expect(r.pool.active[i]).toBe(1);
      expect(r.pool.y[i]).toBe(y0);
      // something drifts into it: detonates for the full damage
      const rock = r.rock(270, y0 - 80);
      let f = 0;
      for (; f < 600 && r.pool.active[i]; f++) { rock.y += 100 * DT; r.step(); }
      expect(r.pool.active[i]).toBe(0);
      expect(r.sys.fx.mineDetonations).toBe(1);
      expect(taken(rock)).toBeCloseTo(100, 6);
      expect(f).toBeGreaterThan(5);
      // an untouched mine goes away after 12 s
      const q = rig();
      const j = q.launch([mod('mine')], 270, 800, 0, -600, 100);
      q.step(60 * 11);
      expect(q.pool.active[j]).toBe(1);
      q.step(60 * 2);
      expect(q.pool.active[j]).toBe(0);
      expect(q.sys.fx.mineExpired).toBe(1);
    },
    wall: {
      grid: () => starterWith('mine'),
      level: () => wallLevel(3, 8, 0, 120),
      seconds: 14,
      count: w => fx(w).mineDetonations,
    },
  },
  {
    id: 'ignite',
    fly: () => {
      const r = rig();
      const e = r.rock(270, 300);
      r.launch([mod('ignite')], 270, 300, 0, 0, 100);
      r.step();
      expect(taken(e)).toBeCloseTo(100, 6);
      expect(e.burnDps).toBeCloseTo(30, 6); // 30% of the hit per second
      // a second hit a second later refreshes the 3 s timer and does not stack the rate
      for (let k = 0; k < 60; k++) r.sys.updateStatus(DT);
      r.launch([mod('ignite')], 270, 300, 0, 0, 100);
      r.step();
      expect(e.burnDps).toBeCloseTo(30, 6);
      expect(e.burnT).toBeGreaterThan(2.9);
      const afterHits = taken(e);
      for (let k = 0; k < 60 * 4; k++) r.sys.updateStatus(DT);
      // first burn: 1 s (30). The refresh runs the full 3 s from the second hit: 90. Never 2 x 30 per second.
      expect(Math.abs(taken(e) - afterHits - 90)).toBeLessThan(1); // 3 s x 30 (plus under one step carried over)
      expect(r.hits.some(h => h.kind === 1)).toBe(true); // ticks arrive as burn hits (small numbers)
      expect(e.burnT).toBe(0);
      // level 3: 50%
      const r3 = rig();
      const e3 = r3.rock(270, 300);
      r3.launch([mod('ignite', 3)], 270, 300, 0, 0, 100);
      r3.step();
      expect(e3.burnDps).toBeCloseTo(50, 6);
    },
    wall: { grid: () => starterWith('ignite'), level: () => wallLevel(3, 12, 0, 0), seconds: 4, count: w => fx(w).burnTicks },
  },
  {
    id: 'corrosion',
    fly: () => {
      const r = rig();
      const e = r.rock(270, 300, 100000, { armor: 10 });
      r.launch([mod('corrosion')], 270, 300, 0, 0, 100);
      r.step();
      expect(e.armor).toBeCloseTo(9.5, 6); // 5% of what is left
      for (let k = 0; k < 30; k++) { r.launch([mod('corrosion')], 270, 300, 0, 0, 100); r.step(); }
      expect(e.armor).toBeCloseTo(5, 6); // stops at 50% of the original
      expect(e.armor0).toBe(10);
      expect(r.sys.fx.corrosionStrips).toBeGreaterThan(10);
      // level 5: cap 90%
      const r5 = rig();
      const e5 = r5.rock(270, 300, 1e9, { armor: 10 });
      for (let k = 0; k < 80; k++) { r5.launch([mod('corrosion', 5)], 270, 300, 0, 0, 100); r5.step(); }
      expect(e5.armor).toBeCloseTo(1, 6);
      // a plain armored target is untouched by a shot without the block
      const r0 = rig();
      const e0 = r0.rock(270, 300, 100000, { armor: 10 });
      r0.launch([], 270, 300, 0, 0, 100);
      r0.step();
      expect(e0.armor).toBe(10);
    },
    wall: {
      grid: () => starterWith('corrosion'),
      level: () => wallLevel(3, 100, 10, 0),
      seconds: 4,
      count: w => (w.all.some(b => b.armor0 !== undefined && b.armor < b.armor0) ? fx(w).corrosionStrips : 0),
    },
  },
  {
    id: 'frostbite',
    fly: () => {
      const r = rig();
      const e = r.rock(270, 300);
      r.launch([mod('frostbite')], 270, 300, 0, 0, 100);
      r.step();
      expect(taken(e)).toBeCloseTo(100, 6);
      expect(e.freezeT).toBeGreaterThan(1.9);
      expect(e.freezeSlow).toBeCloseTo(0.3, 6);
      // a plain shot while frozen deals +25%
      const before = e.hp;
      r.launch([], 270, 300, 0, 0, 100);
      r.step();
      expect(before - e.hp).toBeCloseTo(125, 6);
      // after 2 s it thaws
      for (let k = 0; k < 130; k++) r.sys.updateStatus(DT);
      expect(e.freezeT).toBe(0);
      const b2 = e.hp;
      r.launch([], 270, 300, 0, 0, 100);
      r.step();
      expect(b2 - e.hp).toBeCloseTo(100, 6);
      // the drift is slowed 30% on a real World rock
      const w = new World({ grid: buildStarterGrid(), autoSpawn: false });
      const ptr: PointerState = { x: 0, y: 0, active: false, type: 'mouse', seen: false };
      const a = w.spawnRock(100, 100, 1e6)!;
      const b = w.spawnRock(400, 100, 1e6)!;
      b.freezeT = 5;
      b.freezeSlow = 0.3;
      const ay = a.y;
      const by = b.y;
      w.update(0.1, ptr);
      expect((b.y - by) / (a.y - ay)).toBeCloseTo(0.7, 2);
    },
    wall: { grid: () => starterWith('frostbite'), level: () => wallLevel(3, 12, 0, 0), seconds: 4, count: w => (fx(w).frozenBonusHits > 0 ? fx(w).freezeApplied : 0) },
  },
];

// ---------------------------------------------------------------- tests
describe('chunk 9a blocks: data', () => {
  it.each(ROWS.map(r => [r.id]))('%s is a placeable shop block with one level (fixed), rarity, price and rule text', (id) => {
    const b = BLOCKS[id];
    expect(b.shown).toBe(true);
    expect(b.maxLevel).toBe(1); // no upgrades since 16c-2
    expect(b.fixedLevel).toBeGreaterThanOrEqual(1);
    expect(b.unlock).toBe('shop');
    expect(['uncommon', 'rare', 'epic']).toContain(b.rarity);
    expect(BASE_PRICE[id]).toBe(BLOCK_ECONOMY[id].base);
    expect(BASE_PRICE[id]).toBeGreaterThan(0);
    expect(describeBlock(b, 1)).toMatch(/\d/);
    expect(describeBlock(b, 1)).toBe(describeBlock(b, 4)); // the cell's level does not matter: the block runs at its fixed level
    expect(pickerBlocks().some(p => p.id === id)).toBe(true);
  });
  it('the picker has 66 blocks in 6 categories (Status, Mitosis and Legendary are their own sections)', () => {
    const cats = new Set(pickerBlocks().map(b => b.category));
    expect(pickerBlocks().length).toBe(66);
    expect([...cats].sort()).toEqual(['damage', 'legendary', 'mitosis', 'modifier', 'pathing', 'status']);
    expect(pickerBlocks().filter(b => b.category === 'status').map(b => b.id).sort()).toEqual(['corrosion', 'frostbite', 'ignite', 'static_charge']);
  });
});

describe('chunk 9a blocks: behaviour in Free Fly and the shared pipeline', () => {
  it.each(ROWS.map(r => [r.id, r]))('%s does what its inspector says', (_id, row) => {
    (row as Row).fly();
  });
});

describe('chunk 9a blocks: the real Wall loop with the block in the circuit', () => {
  it.each(ROWS.map(r => [r.id, r]))('%s takes effect in the Wall', (_id, rowIn) => {
    const row = rowIn as Row;
    const level = row.wall.level ? row.wall.level() : wallLevel(3, 16, 0, 0);
    const w = new WallWorld(level, { grid: row.wall.grid() });
    // Bring the wall into reach: its bottom edge 300 px above the ship's start, unless the row's wall approaches by itself.
    if (level.approachSpeed === 0) w.setWallOffset(level.rows * 54 + 300);
    for (let k = 0; k < Math.round(row.wall.seconds * 60); k++) w.update(DT, null);
    expect(row.wall.count(w)).toBeGreaterThan(0);
  });
});

describe('old saves and old blocks', () => {
  it('a v4 save with levels in the old ranges loads: counts and levels kept, new blocks start at 0 / level 1', () => {
    const old = defaultProgress();
    for (const id of Object.keys(old.owned)) delete (old.owned as Record<string, number>)[id];
    for (const id of Object.keys(old.levels)) delete (old.levels as Record<string, number>)[id];
    Object.assign(old.owned, { flat_plus: 7, turn_l: 2, homing: 1 });
    Object.assign(old.levels, { flat_plus: 6, homing: 3 });
    const loaded = sanitizeProgress(JSON.parse(JSON.stringify({ ...old, version: 4, credits: 1234 })));
    // 16c-2: Homing lost its levels (refunded at the old prices: 400 x 2 + 400 x 2 x 2.2), Flat+ keeps its 7 copies and level 6
    expect(loaded.credits).toBe(1234 + 800 + 1760);
    expect(loaded.owned.flat_plus).toBe(7);
    expect(loaded.levels.flat_plus).toBe(6);
    expect(loaded.levels.homing).toBe(1);
    for (const r of ROWS) { expect(loaded.owned[r.id]).toBe(0); expect(loaded.levels[r.id]).toBe(1); }
  });
  it('only the eight upgradable blocks have levels; the old blocks keep their level 1 text', () => {
    const withLevels = pickerBlocks().filter(b => b.maxLevel > 1).map(b => b.id).sort();
    expect(withLevels).toEqual(['armor_piercer', 'flat_plus', 'gamblers_gate', 'jackpot', 'lucky_strike', 'percent_mult', 'pure_converter', 'shield_breaker']);
    expect(BLOCKS.flat_plus.maxLevel).toBe(10);
    expect(BLOCKS.percent_mult.maxLevel).toBe(10);
    expect(describeBlock(BLOCKS.turn_l, 1)).toBe('Turns the signal 90° to the left.');
    expect(describeBlock(BLOCKS.splitter_2, 1)).toBe('Splits the signal into two full copies, one to the left and one to the right.');
    expect(describeBlock(BLOCKS.lucky_strike, 1)).toBe('33% chance to double projectile damage.');
    expect(describeBlock(BLOCKS.jackpot, 1)).toBe('4% chance to multiply projectile damage by 10.');
    expect(describeBlock(BLOCKS.gamblers_gate, 1)).toBe('40% chance to triple projectile damage, otherwise the projectile is lost.');
  });
});
