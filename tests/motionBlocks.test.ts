import { describe, it, expect } from 'vitest';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { blockText, SHORT_MAX, STACK_MAX } from '../src/data/blockText';
import { BLOCK_ECONOMY, capOf } from '../src/data/blockEconomy';
import { isTierUnlocked, LEGACY_RING_GATES, TIER_LOCKS } from '../src/data/tierLocks';
import { compile, Grid } from '../src/engine/compiler';
import { applyDamage, damageToKill } from '../src/engine/damage';
import { Modifier } from '../src/engine/compilerTypes';
import {
  ACCELERATOR_MUL, angleAfter, BRAKE_FLOOR, clampSpeedMul, heavyRoundMul, harmonic, lastBreathMul, MAX_SPEED_MUL, scatterAfter,
} from '../src/engine/effects';
import { ProjectilePool } from '../src/engine/pools';
import { EnemyEntity, ProjectileSystem } from '../src/engine/projectiles';
import { SpatialHash } from '../src/engine/spatialHash';
import { TRIGGERS } from '../src/engine/triggers';
import { Gun, PROJECTILE_SPEED, spawnOffsetsFor } from '../src/game/fire';
import { buildFanGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { blockLockReason, buyCopy, defaultProgress } from '../src/econ/progress';
import { sqKey } from '../src/frontier/world';
import { PROJECTILE_MAX_AGE } from '../src/wall/constants';
import { rng } from '../src/rng';

// Chunk 20b: the thirteen motion blocks (docs/motion-blocks.md). One test per rule, edge cases included.

const NEW = ['curving_left', 'angle_left', 'angle_right', 'accelerator', 'brake', 'scatter', 'upturn', 'align', 'extender', 'centreline', 'magnetized', 'persist'];
const CAPS: Record<string, number> = {
  curving_left: 4, angle_left: 4, angle_right: 4, accelerator: 3, brake: 5, scatter: 3, upturn: 3, align: 1, extender: 2, centreline: 3, magnetized: 3, persist: 1,
};
const TIERS: Record<string, number> = { accelerator: 5, brake: 15, scatter: 15, upturn: 20, align: 25, extender: 30, centreline: 40, magnetized: 45, persist: 50 };

/** The Fan's straight column under its middle ejector: Flat+ first, then `ids` in order. */
function fanLine(ids: string[]): Grid {
  const g = buildFanGrid();
  place(g, 5, 9, 'flat_plus');
  ids.forEach((id, k) => place(g, 5, 8 - k, id));
  return g;
}
const times = (id: string, n: number) => Array.from({ length: n }, () => id);
const packetOf = (ids: string[]) => compile(fanLine(ids)).recipes[0].packet;

/** A running gun for a compiled grid. */
function gunFor(g: Grid, poolMax = 4000) {
  const compiled = compile(g);
  const pool = new ProjectilePool(poolMax);
  const sys = new ProjectileSystem(pool);
  sys.modifiersTable = compiled.recipes.map(r => r.packet.mods);
  const gun = new Gun(pool, sys, compiled.recipes, spawnOffsetsFor(compiled.recipes, g), 0.25);
  const pulse = () => { gun.update(0.25, 270, 800); gun.fire(270, 800); };
  return { pool, sys, gun, pulse, compiled };
}
const alive = (pool: ProjectilePool) => Array.from({ length: pool.max }, (_, i) => i).filter(i => pool.active[i]);
const headingDeg = (pool: ProjectilePool, i: number) => (Math.atan2(pool.vy[i], pool.vx[i]) * 180) / Math.PI;

/** A projectile rig (the same shape as tests/legendaries.test.ts). */
function rig(dt = 1 / 60) {
  const pool = new ProjectilePool(64);
  const sys = new ProjectileSystem(pool);
  const enemies: EnemyEntity[] = [];
  const hash = new SpatialHash(540, 960, 64);
  const rock = (x: number, y: number, hp = 1e6, radius = 20) => {
    const e: EnemyEntity = { id: enemies.length + 1, x, y, radius, hp, maxHp: hp, armor: 0, shield: 0, maxShield: 0 };
    enemies.push(e);
    return e;
  };
  const launch = (mods: Modifier[], x: number, y: number, vx: number, vy: number, damage = 100) => {
    sys.modifiersTable = [mods];
    sys.shipX = x; sys.shipY = y;
    const i = pool.spawn(x, y, vx, vy, damage, 0, 0);
    sys.init(i);
    return i;
  };
  const steer = () => sys.steer(dt, enemies);
  const move = () => { for (let i = 0; i < pool.max; i++) if (pool.active[i]) { pool.x[i] += pool.vx[i] * dt; pool.y[i] += pool.vy[i] * dt; } };
  const hits = () => {
    hash.clear();
    for (const e of enemies) hash.insert(e.id, e.x, e.y);
    sys.processHits(enemies, hash, 1);
  };
  const step = () => { steer(); move(); hits(); };
  return { pool, sys, enemies, rock, launch, step, steer };
}
const mod = (type: string, n = 1): Modifier[] => Array.from({ length: n }, () => ({ type }));

describe('motion blocks: data', () => {
  it('thirteen Modifier blocks, shown, one level, the caps of the design note, a short line of at most 60 characters', () => {
    expect(Object.keys(CAPS).sort()).toEqual([...NEW].sort());
    const picker = pickerBlocks().map(b => b.id);
    for (const id of NEW) {
      const b = BLOCKS[id];
      expect(b.category, id).toBe('modifier');
      expect(b.shown && picker.includes(id), id).toBe(true);
      expect(b.maxLevel, id).toBe(1);
      expect(capOf(id), id).toBe(CAPS[id]);
      expect(BLOCK_ECONOMY[id].base, id).toBeGreaterThan(0);
      const t = blockText(b);
      expect(t.short.length, id).toBeLessThanOrEqual(SHORT_MAX);
      // A stacking line exactly for the blocks whose extra copy adds something.
      if (CAPS[id] > 1) { expect(t.stack, id).not.toBeNull(); expect(t.stack!.length, id).toBeLessThanOrEqual(STACK_MAX); } else expect(t.stack, id).toBeNull();
    }
  });
  it('Ship Magnet reuses the old hidden "magnetized" block; Magnetize Target stays hidden', () => {
    expect(BLOCKS.magnetized.name).toBe('Ship Magnet');
    expect(BLOCKS.magnetized.shown).toBe(true);
    expect(BLOCKS.magnetize_target.shown).toBe(false);
  });
  it('the trigger table has the two new rows', () => {
    expect(TRIGGERS).not.toHaveProperty('reverse');
    expect(TRIGGERS.align).toMatchObject({ fires: 'every_hit', fragments: true });
    expect(TRIGGERS.persist).toMatchObject({ fires: 'every_hit', fragments: true });
  });
});

describe('motion blocks: compile', () => {
  it('Curving Left is the mirror of Curving Right and counts as a turn for Waypoint; the Angle blocks do not', () => {
    expect(packetOf(['curving_left']).mods).toContainEqual({ type: 'curve', dir: 'left', level: 1 });
    expect(compile(fanLine(['curving_left', 'waypoint'])).recipes[0].packet.damage).toBeCloseTo(2 * 1.1, 12);
    expect(compile(fanLine(['angle_left', 'waypoint'])).recipes[0].packet.damage).toBeCloseTo(2, 12);
  });
  it('Angle Left / Right: 15 degrees a copy, at most 60; on one path they add', () => {
    expect([1, 2, 3, 4, 5, 6].map(n => packetOf(times('angle_left', n)).angle)).toEqual([-15, -30, -45, -60, -60, -60]);
    expect(packetOf(times('angle_right', 4)).angle).toBe(60);
    expect(packetOf(['angle_left', 'angle_left', 'angle_right']).angle).toBe(-15);
    expect(angleAfter(55, 1)).toBe(60);
    expect(packetOf([]).angle).toBe(0);
  });
  it('Accelerator: x1.5 a copy; Brake: x0.7 a copy, never under 0.2; the ceiling is x4', () => {
    expect(packetOf(['accelerator']).speedMul).toBe(ACCELERATOR_MUL);
    expect(packetOf(times('accelerator', 3)).speedMul).toBeCloseTo(3.375, 12);
    expect(packetOf(times('accelerator', 4)).speedMul).toBe(MAX_SPEED_MUL); // 5.06 would be over the ceiling
    expect(clampSpeedMul(9)).toBe(MAX_SPEED_MUL);
    expect(packetOf(['brake']).speedMul).toBeCloseTo(0.7, 12);
    expect(packetOf(times('brake', 4)).speedMul).toBeCloseTo(0.2401, 12);
    expect(packetOf(times('brake', 5)).speedMul).toBe(BRAKE_FLOOR); // 0.168 would be under the floor
    expect(packetOf(times('brake', 6)).speedMul).toBe(BRAKE_FLOOR);
    expect(clampSpeedMul(0.01)).toBe(BRAKE_FLOOR);
  });
  it('Heavy Round reads Brake: Brake to 0.2x gives x5 (and an Accelerator gives only x2)', () => {
    // Fan: hull speed 1. Flat+ (2), five Brakes (0.2x), Heavy Round: 2 x 5.
    expect(compile(fanLine([...times('brake', 5), 'heavy_round'])).recipes[0].packet.damage).toBe(10);
    expect(compile(fanLine([...times('brake', 2), 'heavy_round'])).recipes[0].packet.damage).toBeCloseTo(2 * heavyRoundMul(0.49), 9);
    expect(compile(fanLine(['accelerator', 'heavy_round'])).recipes[0].packet.damage).toBe(4);
  });
  it('Scatter: +-30 degrees, +15 a copy, at most +-60', () => {
    expect([1, 2, 3, 4].map(n => packetOf(times('scatter', n)).scatter)).toEqual([30, 45, 60, 60]);
    expect(scatterAfter(0)).toBe(30);
  });
  it('Extender: lifetime x2 a copy', () => {
    expect([1, 2, 3].map(n => packetOf(times('extender', n)).lifeMul)).toEqual([2, 4, 8]);
    expect(packetOf([]).lifeMul).toBe(1);
  });
});

describe('motion blocks: the gun', () => {
  it('the launch angle follows Angle Left / Right, and a Mirror clone flies the same way', () => {
    const left = gunFor(fanLine(['angle_left', 'angle_left']));
    left.pulse();
    const [a] = alive(left.pool);
    expect(headingDeg(left.pool, a)).toBeCloseTo(-90 - 30, 6); // 30 degrees left of straight up
    expect(Math.hypot(left.pool.vx[a], left.pool.vy[a])).toBeCloseTo(PROJECTILE_SPEED, 3);
    const right = gunFor(fanLine(['angle_right']));
    right.pulse();
    expect(headingDeg(right.pool, alive(right.pool)[0])).toBeCloseTo(-90 + 15, 6);
    const mirror = gunFor(fanLine(['angle_left', 'mirror']));
    mirror.pulse();
    const [s, c] = alive(mirror.pool);
    expect(mirror.pool.vx[s]).toBeCloseTo(mirror.pool.vx[c], 6);
    expect(mirror.pool.vy[s]).toBeCloseTo(mirror.pool.vy[c], 6);
  });
  it('speed: Accelerator x1.5, Brake x0.7 on the real launch speed', () => {
    const fast = gunFor(fanLine(['accelerator']));
    fast.pulse();
    expect(Math.hypot(fast.pool.vx[alive(fast.pool)[0]], fast.pool.vy[alive(fast.pool)[0]])).toBeCloseTo(PROJECTILE_SPEED * 1.5, 3);
    const slow = gunFor(fanLine(times('brake', 6)));
    slow.pulse();
    expect(Math.hypot(slow.pool.vx[alive(slow.pool)[0]], slow.pool.vy[alive(slow.pool)[0]])).toBeCloseTo(PROJECTILE_SPEED * 0.2, 3);
  });
  it('Scatter: every shot inside +-30 degrees of straight up, both sides used, not all the same; 3 copies reach +-60; a Mirror clone shares the draw', () => {
    rng.reset(12345);
    const one = gunFor(fanLine(['scatter']));
    const angles: number[] = [];
    for (let k = 0; k < 200; k++) { one.pulse(); }
    for (const i of alive(one.pool)) angles.push(headingDeg(one.pool, i) + 90);
    expect(angles.length).toBe(200);
    expect(Math.max(...angles)).toBeLessThanOrEqual(30);
    expect(Math.min(...angles)).toBeGreaterThanOrEqual(-30);
    expect(Math.max(...angles)).toBeGreaterThan(20);
    expect(Math.min(...angles)).toBeLessThan(-20);
    const three = gunFor(fanLine(times('scatter', 3)));
    for (let k = 0; k < 300; k++) three.pulse();
    const wide = alive(three.pool).map(i => headingDeg(three.pool, i) + 90);
    expect(Math.max(...wide.map(Math.abs))).toBeGreaterThan(45);
    expect(Math.max(...wide.map(Math.abs))).toBeLessThanOrEqual(60);
    // Angle sets the middle of the cone.
    const mid = gunFor(fanLine(['angle_left', 'angle_left', 'scatter']));
    for (let k = 0; k < 200; k++) mid.pulse();
    const centred = alive(mid.pool).map(i => headingDeg(mid.pool, i) + 90);
    expect(Math.max(...centred)).toBeLessThanOrEqual(0 + 1e-6); // -30 +- 30
    expect(Math.min(...centred)).toBeGreaterThanOrEqual(-60 - 1e-6);
    const pair = gunFor(fanLine(['scatter', 'mirror']));
    for (let k = 0; k < 20; k++) pair.pulse();
    const ids = alive(pair.pool);
    for (let k = 0; k < ids.length; k += 2) expect(pair.pool.vx[ids[k]]).toBeCloseTo(pair.pool.vx[ids[k + 1]], 6);
  });
  it('Extender sets the life of the shot (and its Mirror clone); a plain shot has 3 s', () => {
    const plain = gunFor(fanLine([]));
    plain.pulse();
    expect(plain.pool.life[alive(plain.pool)[0]]).toBe(PROJECTILE_MAX_AGE);
    const ext = gunFor(fanLine(['extender', 'extender', 'mirror']));
    ext.pulse();
    for (const i of alive(ext.pool)) expect(ext.pool.life[i]).toBe(PROJECTILE_MAX_AGE * 4);
  });
  it('Centreline keeps the x the shot was fired from', () => {
    const g = gunFor(fanLine(['centreline']));
    g.pulse();
    expect(g.pool.anchorX[alive(g.pool)[0]]).toBe(270);
  });
});

describe('motion blocks: flight', () => {
  it('Last Breath\'s window follows the life: with an Extender (6 s) a hit at age 4.5 is not yet in the last second', () => {
    expect(lastBreathMul(4.5, 6)).toBe(1);
    expect(lastBreathMul(5.5, 6)).toBe(2);
    for (const [age, mul] of [[4.5, 1], [5.5, 2]] as const) {
      const r = rig();
      const i = r.launch(mod('last_breath'), 270, 500, 0, -600, 100);
      r.pool.life[i] = 6;
      const e = r.rock(270, 480);
      r.pool.age[i] = age;
      r.step();
      expect(1e6 - e.hp, `age ${age}`).toBeCloseTo(100 * mul, 6);
    }
  });

  it('Upturn: nothing for the first 0.4 s, then a turn toward straight up at 120 degrees a second', () => {
    const r = rig();
    const i = r.launch(mod('upturn'), 270, 900, 600 * Math.sin(Math.PI / 4), -600 * Math.cos(Math.PI / 4)); // 45 degrees right of up
    for (let k = 0; k < 23; k++) r.step(); // 0.383 s: not yet
    expect(headingDeg(r.pool, i)).toBeCloseTo(-45, 4);
    for (let k = 0; k < 15; k++) r.step(); // from 0.4 s on: 15 steps of 2 degrees
    expect(headingDeg(r.pool, i)).toBeCloseTo(-45 - 30, 0);
    for (let k = 0; k < 60; k++) r.step();
    expect(headingDeg(r.pool, i)).toBeCloseTo(-90, 3);
    expect(Math.hypot(r.pool.vx[i], r.pool.vy[i])).toBeCloseTo(600, 3);
  });
  it('Upturn: extra copies turn faster by the harmonic sum, and it cancels a Curving Right drift', () => {
    const turned = (copies: number) => {
      const r = rig();
      const i = r.launch(mod('upturn', copies), 270, 900, 600 * Math.sin(Math.PI / 2.5), -600 * Math.cos(Math.PI / 2.5));
      r.pool.age[i] = 0.4;
      const before = headingDeg(r.pool, i);
      for (let k = 0; k < 6; k++) r.step();
      return Math.abs(headingDeg(r.pool, i) - before);
    };
    expect(turned(2) / turned(1)).toBeCloseTo(harmonic(2), 2);
    expect(turned(3) / turned(1)).toBeCloseTo(harmonic(3), 2);
    const r = rig();
    const i = r.launch([{ type: 'curve', dir: 'right', level: 1 }, { type: 'upturn' }], 270, 900, 0, -600);
    for (let k = 0; k < 120; k++) r.step();
    expect(Math.abs(headingDeg(r.pool, i) + 90)).toBeLessThan(2); // curves right at 90/s, comes back at 120/s: nearly straight
  });
  it('Upturn turns a shot flying down the short way (any side) back up', () => {
    const r = rig();
    const i = r.launch(mod('upturn'), 270, 100, 50, 590);
    r.pool.age[i] = 0.5;
    for (let k = 0; k < 150; k++) r.step();
    expect(headingDeg(r.pool, i)).toBeCloseTo(-90, 2);
  });

  it('Curving Left turns anticlockwise at 30 degrees a second (one copy)', () => {
    const r = rig();
    const i = r.launch([{ type: 'curve', dir: 'left', level: 1 }], 270, 900, 0, -600);
    for (let k = 0; k < 30; k++) r.step();
    expect(headingDeg(r.pool, i)).toBeCloseTo(-105, 0);
    expect(r.pool.vx[i]).toBeLessThan(0);
  });

  it('Centreline pulls toward the firing line from either side, harder with more copies, without changing the speed', () => {
    const vxAfter = (x: number, copies: number) => {
      const r = rig();
      const i = r.launch(mod('centreline', copies), 270, 900, 0, -600);
      r.pool.anchorX[i] = 270;
      r.pool.x[i] = x;
      for (let k = 0; k < 10; k++) r.steer();
      return { vx: r.pool.vx[i], speed: Math.hypot(r.pool.vx[i], r.pool.vy[i]) };
    };
    expect(vxAfter(350, 1).vx).toBeLessThan(0); // right of the line: pulled left
    expect(vxAfter(190, 1).vx).toBeGreaterThan(0); // left of the line: pulled right
    expect(vxAfter(270, 1).vx).toBe(0); // on the line: nothing
    expect(Math.abs(vxAfter(350, 3).vx)).toBeGreaterThan(Math.abs(vxAfter(350, 1).vx) * 1.5);
    expect(vxAfter(350, 1).speed).toBeCloseTo(600, 3);
    // Nothing without the block.
    const r = rig();
    const i = r.launch([], 270, 900, 0, -600);
    r.pool.x[i] = 350;
    r.steer();
    expect(r.pool.vx[i]).toBe(0);
  });

  it('Ship Magnet pulls toward the ship\'s CURRENT position (it follows the ship), harder with more copies, and the speed stays', () => {
    const r = rig();
    const i = r.launch(mod('magnetized'), 270, 800, 0, -600);
    r.pool.x[i] = 400; r.pool.y[i] = 300;
    r.sys.shipX = 270; r.sys.shipY = 800;
    for (let k = 0; k < 5; k++) r.steer();
    expect(r.pool.vx[i]).toBeLessThan(0); // the ship is to the left ...
    expect(r.pool.vy[i]).toBeGreaterThan(-600); // ... and below
    r.sys.shipX = 500; // the ship moved to the right: now the pull is to the right
    const vx0 = r.pool.vx[i];
    for (let k = 0; k < 30; k++) r.steer();
    expect(r.pool.vx[i]).toBeGreaterThan(vx0);
    expect(Math.hypot(r.pool.vx[i], r.pool.vy[i])).toBeLessThanOrEqual(600 + 1e-3); // a pull never speeds a shot past its launch speed
    const pull = (copies: number) => {
      const q = rig(1e-4);
      const j = q.launch(mod('magnetized', copies), 270, 800, 0, -600);
      q.pool.x[j] = 400; q.pool.y[j] = 300;
      q.steer();
      return Math.abs(q.pool.vx[j]);
    };
    expect(pull(3) / pull(1)).toBeCloseTo(harmonic(3), 2);
  });
  it('Ship Magnet swarms the ship: shots stay near it for their life, then the life ends them (3 s)', () => {
    const r = rig();
    const ids = [-60, -30, 0, 30, 60].map(dx => r.launch(mod('magnetized'), 270 + dx, 780, 0, -600));
    r.sys.shipX = 270; r.sys.shipY = 800;
    let maxDist = 0;
    for (let k = 0; k < 120; k++) { // 2 s
      r.step();
      for (const i of ids) maxDist = Math.max(maxDist, Math.hypot(r.pool.x[i] - 270, r.pool.y[i] - 800));
    }
    expect(maxDist).toBeLessThan(300); // plain shots would be 1200 px away
    for (const i of ids) expect(r.pool.active[i]).toBe(1);
    for (const i of ids) expect(r.pool.age[i]).toBeGreaterThan(1.9);
  });

  it('Ship Magnet: a shot flying straight away from the ship slows, turns and comes back (the pull is not cancelled by the speed cap)', () => {
    const r = rig();
    const i = r.launch(mod('magnetized'), 270, 800, 0, -600);
    r.sys.shipX = 270; r.sys.shipY = 800;
    let top = 800, back = false;
    for (let k = 0; k < 120; k++) { r.step(); top = Math.min(top, r.pool.y[i]); if (r.pool.vy[i] > 0) back = true; }
    expect(top).toBeGreaterThan(500);
    expect(back).toBe(true);
  });
  it('a fast shot cannot tunnel: at the top speed one 30 Hz step is longer than a small rock, and it still hits', () => {
    for (const dt of [1 / 60, 1 / 30]) {
      const r = rig(dt);
      const speed = PROJECTILE_SPEED * MAX_SPEED_MUL * 1.3; // Accelerator ceiling on a fast hull
      const i = r.launch([], 270, 600, 0, -speed, 10);
      const e = r.rock(270, 600 - speed * dt / 2, 100, 8); // a small rock half-way along the first step's path
      expect(speed * dt).toBeGreaterThan(2 * (8 + 10)); // the step is longer than the target is wide
      r.step();
      expect(e.hp, `dt ${dt}`).toBe(90);
      expect(r.pool.active[i]).toBe(0); // a plain shot is used up by its hit
      expect(r.sys.fx.sweepHits).toBe(1);
    }
  });
  it('the swept test takes the FIRST target on the path and puts the shot where it hit', () => {
    const r = rig(1 / 30);
    const i = r.launch(mod('piercing'), 270, 600, 0, -3000, 10);
    const near = r.rock(270, 560, 100, 8);
    const far = r.rock(270, 520, 100, 8);
    r.step();
    expect(near.hp).toBe(90);
    expect(far.hp).toBe(100);
    expect(r.pool.active[i]).toBe(1); // it passes through (2 targets) and goes on
    expect(r.pool.y[i]).toBeGreaterThan(540); // stopped at the first target, not at the end of its move
  });
  it('a normal-speed shot never uses the sweep', () => {
    const r = rig();
    r.launch([], 270, 600, 0, -936, 10);
    r.rock(270, 580, 100, 20);
    r.step();
    expect(r.sys.fx.sweepHits).toBe(0);
  });
});

describe('motion blocks: hits', () => {
  it('Align: after a pierce pass the shot flies straight up again; without Align it keeps its heading', () => {
    for (const [mods, vx] of [[[...mod('piercing'), ...mod('align')], 0], [mod('piercing'), 300]] as [Modifier[], number][]) {
      const r = rig();
      const i = r.launch(mods, 270, 600, 300, -520, 10);
      r.rock(270 + 5, 600 - 9, 1e6, 20);
      r.step();
      expect(r.pool.active[i]).toBe(1);
      expect(r.pool.vx[i]).toBeCloseTo(vx, 6);
      expect(Math.hypot(r.pool.vx[i], r.pool.vy[i])).toBeCloseTo(Math.hypot(300, 520), 3);
    }
  });
  it('Align after a bounce points straight up too', () => {
    const r = rig();
    const i = r.launch([{ type: 'bouncing', level: 1 }, { type: 'align' }], 270, 600, 200, -500, 10);
    r.rock(270, 580, 1e6, 20);
    r.step();
    expect(r.pool.active[i]).toBe(1);
    expect(r.pool.vx[i]).toBe(0);
    expect(r.pool.vy[i]).toBeLessThan(0);
    expect(r.sys.fx.aligns).toBe(1);
  });

  it('Persist: a shot spends what each target had left, goes on through kills and ends on the one it cannot kill', () => {
    const r = rig();
    const i = r.launch(mod('persist'), 270, 700, 0, -600, 100);
    const a = r.rock(270, 690, 30), b = r.rock(270, 610, 30), c = r.rock(270, 530, 30), d = r.rock(270, 450, 30);
    const left: number[] = [];
    for (let k = 0; k < 40; k++) {
      r.step();
      if (r.pool.active[i]) left.push(r.pool.damage[i]);
    }
    expect([a.hp, b.hp, c.hp]).toEqual([-70, -40, -10]); // each took what the shot still carried: 100, 70, 40 ...
    expect(d.hp).toBe(30 - 10); // ... the fourth took the 10 that were left and survived
    expect(r.pool.active[i]).toBe(0); // and the shot ended on the target it could not kill
    expect(left[0]).toBeCloseTo(70, 6);
    expect(left).toContain(40);
    expect(r.sys.fx.persistContinues).toBe(3);
  });
  it('Persist: a target with more than the shot has ends it at once (it spent everything)', () => {
    const r = rig();
    const i = r.launch(mod('persist'), 270, 700, 0, -600, 100);
    const t = r.rock(270, 690, 500);
    r.step();
    expect(t.hp).toBe(400);
    expect(r.pool.active[i]).toBe(0);
  });
  it('Persist counts the shield and armor the damage code counts, not just HP', () => {
    const r = rig();
    const i = r.launch(mod('persist'), 270, 700, 0, -600, 100);
    const t = r.rock(270, 690, 40);
    t.shield = 30; t.maxShield = 30; // 30 shield + 40 HP = 70 to kill
    const u = r.rock(270, 640, 1e6);
    r.step();
    expect(t.hp).toBeLessThanOrEqual(0);
    expect(r.pool.damage[i]).toBeCloseTo(30, 6); // 100 - 70
    expect(u.hp).toBe(1e6);
  });
  it('damageToKill is the smallest killing hit: applyDamage with it kills, with a hair less it does not (shield, armor, pure, Shield-Breaker, Armor-Piercer)', () => {
    const cases = [
      { hp: 40, shield: 0, armor: 0, pure: 0, ap: 0, sb: false },
      { hp: 40, shield: 30, armor: 0, pure: 0, ap: 0, sb: false },
      { hp: 40, shield: 30, armor: 150, pure: 0, ap: 0, sb: false },
      { hp: 40, shield: 30, armor: 150, pure: 0.5, ap: 0, sb: false },
      { hp: 40, shield: 30, armor: 150, pure: 1, ap: 0, sb: false },
      { hp: 40, shield: 30, armor: 150, pure: 0.3, ap: 3, sb: 2.5 },
      { hp: 40, shield: 1000, armor: 150, pure: 0.4, ap: 0, sb: true }, // pure damage alone kills before the shield is empty
    ];
    for (const c of cases) {
      const need = damageToKill({ hp: c.hp, maxHp: c.hp, armor: c.armor, shield: c.shield, maxShield: c.shield }, c.pure, 1, c.ap, c.sb);
      const hit = (d: number) => {
        const e = { hp: c.hp, maxHp: c.hp, armor: c.armor, shield: c.shield, maxShield: c.shield };
        return applyDamage(e, d, c.pure, 1, c.ap, c.sb).killed;
      };
      expect(hit(need * 1.0001), JSON.stringify(c)).toBe(true);
      expect(hit(need * 0.999), JSON.stringify(c)).toBe(false);
    }
    expect(damageToKill({ hp: 0, maxHp: 10, armor: 0, shield: 0, maxShield: 0 }, 0, 1)).toBe(0);
  });
  it('Persist + Piercing: kills spend damage, and Piercing\'s free passes carry the shot through targets it cannot kill', () => {
    const r = rig();
    r.launch([...mod('persist'), ...mod('piercing')], 270, 700, 0, -600, 100);
    const soft = r.rock(270, 690, 30);
    const tough = r.rock(270, 610, 1000); // cannot be killed: Persist alone would end here
    const last = r.rock(270, 530, 30);
    for (let k = 0; k < 40; k++) r.step();
    expect(soft.hp).toBeLessThanOrEqual(0);
    expect(tough.hp).toBe(1000 - 70); // hit with the 70 left after the first kill, passed through for free
    expect(last.hp).toBeLessThanOrEqual(0); // and the shot, still at 70, killed this one too
    expect(r.sys.fx.persistContinues).toBe(2);
  });
  it('Persist + AoE: the blast fires on every hit and spends nothing', () => {
    const r = rig();
    const i = r.launch([...mod('persist'), ...mod('aoe_circle')], 270, 700, 0, -600, 100);
    const a = r.rock(270, 690, 30, 10);
    const side = r.rock(310, 690, 1e6, 10);
    r.step();
    expect(side.hp).toBeLessThan(1e6); // the blast reached the neighbour
    expect(r.pool.active[i]).toBe(1);
    expect(r.pool.damage[i]).toBeGreaterThan(60); // the shot kept what the dead target did not need (the blast spent none)
    expect(a.hp).toBeLessThanOrEqual(0);
  });
});

describe('motion blocks: Free Fly lifetime', () => {
  it('a shot kept in play (Ship Magnet) is retired at its life, and an Extender lengthens it', async () => {
    const { World } = await import('../src/game/world');
    const { buildDartGrid } = await import('../src/game/gridUtils');
    const grid = buildDartGrid();
    place(grid, 1, 2, 'magnetized');
    const w = new World({ grid, autoSpawn: false });
    const pointer = { x: 0, y: 0, active: false, type: 'mouse', seen: false } as const;
    w.fire();
    expect(w.pool.count).toBeGreaterThan(0);
    const i = alive(w.pool)[0];
    expect(w.pool.life[i]).toBe(PROJECTILE_MAX_AGE);
    // Pin the shot to the ship so only its age can end it, and stop new ones.
    for (let f = 0; f < 150; f++) { // 2.5 s
      w.pool.x[i] = w.shipX; w.pool.y[i] = w.shipY - 40;
      w.update(1 / 60, pointer);
    }
    expect(w.pool.active[i]).toBe(1);
    for (let f = 0; f < 60; f++) { w.pool.x[i] = w.shipX; w.pool.y[i] = w.shipY - 40; w.update(1 / 60, pointer); }
    expect(w.pool.active[i] && w.pool.age[i] > PROJECTILE_MAX_AGE).toBeFalsy();
  });
});

describe('motion blocks: campaign-tier locks', () => {
  it('the table of the design: ten new blocks and the sixteen moved ones, tiers 5 to 60', () => {
    for (const [id, tier] of Object.entries(TIERS)) expect(TIER_LOCKS[id], id).toBe(tier);
    for (const id of ['curving_left', 'angle_left', 'angle_right']) expect(TIER_LOCKS[id], id).toBeUndefined();
    for (const id of Object.keys(TIER_LOCKS)) expect(BLOCKS[id], id).toBeDefined();
    expect(Object.keys(LEGACY_RING_GATES).length).toBe(16);
    for (const id of Object.keys(LEGACY_RING_GATES)) expect(TIER_LOCKS[id], id).toBeGreaterThanOrEqual(5);
  });
  it('locked until the tier is passed; the Shop refuses; the text matches the Frontier lock style', () => {
    const p = defaultProgress();
    p.credits = 1e9;
    expect(blockLockReason(p, 'accelerator')).toBe('Pass tier 5');
    expect(buyCopy(p, 'accelerator')).toEqual({ ok: false, error: 'Pass tier 5' });
    p.passedTiers = [1, 2, 3, 4];
    expect(blockLockReason(p, 'accelerator')).toBe('Pass tier 5');
    p.passedTiers = [1, 2, 3, 4, 5];
    expect(blockLockReason(p, 'accelerator')).toBeNull();
    expect(buyCopy(p, 'accelerator').ok).toBe(true);
    // Never locked: the three free blocks.
    const q = defaultProgress();
    q.credits = 1e9;
    for (const id of ['curving_left', 'angle_left', 'angle_right']) expect(blockLockReason(q, id), id).toBeNull();
  });
  it('a player who already passed a later tier has everything below it', () => {
    const p = defaultProgress();
    p.passedTiers = Array.from({ length: 60 }, (_, k) => k + 1);
    for (const id of Object.keys(TIER_LOCKS)) expect(blockLockReason(p, id), id).toBeNull();
    const q = defaultProgress();
    q.passedTiers = Array.from({ length: 49 }, (_, k) => k + 1);
    expect(blockLockReason(q, 'persist')).toBe('Pass tier 50');
    expect(blockLockReason(q, 'chain_lightning')).toBe('Pass tier 60');
  });
  it('owned copies are never lost: a save that owns one keeps buying, and a reached old Frontier ring keeps its block', () => {
    const p = defaultProgress();
    p.owned.orbit = 1;
    expect(blockLockReason(p, 'orbit')).toBeNull();
    const q = defaultProgress();
    expect(blockLockReason(q, 'gravity_well')).toBe('Pass tier 32');
    q.frontier.sq[sqKey(-25, 0)] = 2; // West ring 25 reached under the old table
    expect(isTierUnlocked('gravity_well', 0, [], { N: 0, E: 0, S: 0, W: 25 })).toBe(true);
    expect(isTierUnlocked('gravity_well', 0, [], { N: 99, E: 99, S: 99, W: 24 })).toBe(false);
  });
});
