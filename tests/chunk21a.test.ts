import { describe, it, expect } from 'vitest';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { blockText, STACK_MAX } from '../src/data/blockText';
import { BLOCK_ECONOMY, capOf } from '../src/data/blockEconomy';
import { TIER_LOCKS } from '../src/data/tierLocks';
import { compile, Grid } from '../src/engine/compiler';
import { Modifier } from '../src/engine/compilerTypes';
import {
  curveRateDeg, curveTotalDeg, LANE_GAP, laneOffset, loneShotMul, randomCurveRateDeg, UPTURN_DELAY, upturnDelay,
} from '../src/engine/effects';
import { ProjectilePool, } from '../src/engine/pools';
import { EnemyEntity, PHASE_BOOM_BACK, PHASE_MINE_WAIT, PHASE_ORBIT, ProjectileSystem } from '../src/engine/projectiles';
import { SpatialHash } from '../src/engine/spatialHash';
import { TRIGGERS } from '../src/engine/triggers';
import { Gun, spawnOffsetsFor } from '../src/game/fire';
import { buildFanGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { flyRunResult } from '../src/game/runEnd';
import { loadBuilder, serializeBuilder } from '../src/builder/persist';
import { BuilderModel } from '../src/builder/model';
import { loadProgress, PROGRESS_VERSION, ProgressStore } from '../src/econ/progress';
import { migrateRemovedBlocks, removedBlockRefund } from '../src/econ/migrate';
import { BUILD_KEY_HELP, keyAction } from '../src/builder/keys';
import { avgDps, shotLines } from '../src/ui/runStats';
import { SHOT_LOOK_BANDS, SHOT_LOOKS, shotBand, shotLookFor } from '../src/ui/shotLook';
import { rng } from '../src/rng';

// Chunk 21a (docs/chunk21a.md): +1 Projectile, Reverse removal, stacking curves, Upturn override, keys, run stats, shot looks, prices.

// ------------------------------------------------------------------ +1 Projectile
/** The Fan's column under its middle ejector (1-indexed col 5): Flat+ first, then `ids` upward. */
function fanLine(ids: string[]): Grid {
  const g = buildFanGrid();
  place(g, 5, 9, 'flat_plus');
  ids.forEach((id, k) => place(g, 5, 8 - k, id));
  return g;
}
const times = (id: string, n: number) => Array.from({ length: n }, () => id);
/** Recipes of the middle ejector, as [damage] in lane order. */
const lane = (ids: string[]) => compile(fanLine(ids)).recipes.map(r => r.packet.damage);

/** The Fan with a Splitter 2 above `before` blocks: both branches turn up into the outer ejectors. */
function splitGrid(before: string[], after: string[] = []): Grid {
  const g = buildFanGrid();
  let row = 9;
  for (const id of before) place(g, 5, row--, id);
  place(g, 5, row, 'splitter_2');
  // Left branch: west along the row to column 2, turn right (north), up column 2 to the ejector at (2,1).
  place(g, 2, row, 'turn_r');
  for (let k = 0; k < after.length; k++) place(g, 2, row - 1 - k, after[k]);
  // Right branch: east along the row to column 8, turn left (north).
  place(g, 8, row, 'turn_l');
  for (let k = 0; k < after.length; k++) place(g, 8, row - 1 - k, after[k]);
  return g;
}

describe('+1 Projectile: the compiler', () => {
  it('is a shown Damage block with cap 10 and a tier lock of 10', () => {
    expect(BLOCKS.plus_one.category).toBe('damage');
    expect(pickerBlocks().map(b => b.id)).toContain('plus_one');
    expect(capOf('plus_one')).toBe(10);
    expect(BLOCK_ECONOMY.plus_one).toMatchObject({ base: 110, growth: 1.5 });
    expect(TIER_LOCKS.plus_one).toBe(10);
  });

  it('adds ONE shot with base damage; blocks before it do not touch the new shot', () => {
    expect(lane([])).toEqual([2]); // Flat+ only: 1 + 1
    // [Flat+, +1]: the main shot has Flat+ (2), the new shot is a plain base shot (1).
    expect(lane(['plus_one'])).toEqual([2, 1]);
    // [Flat+, Percent x, +1]: Percent x was before the block, so only the main shot has it.
    expect(lane(['percent_mult', 'plus_one'])).toEqual([3, 1]);
  });

  it('every block AFTER it works on both shots', () => {
    expect(lane(['plus_one', 'percent_mult'])).toEqual([3, 1.5]);
    expect(lane(['plus_one', 'flat_plus', 'percent_mult'])).toEqual([4.5, 3]); // (2 + 1) x 1.5 and (1 + 1) x 1.5
  });

  it('two copies make three shots, each new one with only the blocks after its own copy', () => {
    expect(lane(times('plus_one', 2))).toEqual([2, 1, 1]);
    expect(lane(['plus_one', 'percent_mult', 'plus_one'])).toEqual([3, 1.5, 1]);
    expect(lane(times('plus_one', 7)).length).toBe(8); // the Fan's column has room for seven blocks
  });

  it('a splitter after it copies both shots to both branches', () => {
    const rec = compile(splitGrid(['flat_plus', 'plus_one'])).recipes;
    expect(rec.length).toBe(4); // two branches x (main + extra)
    expect(rec.map(r => r.packet.damage).sort()).toEqual([1, 1, 2, 2]);
    expect(new Set(rec.map(r => r.x)).size).toBe(2);
    // A multiplier after the splitter multiplies the extra shot on both branches as well.
    const after = compile(splitGrid(['flat_plus', 'plus_one'], ['percent_mult'])).recipes;
    expect(after.map(r => r.packet.damage).sort((a, b) => a - b)).toEqual([1.5, 1.5, 3, 3]);
  });

  it('Proj/pulse and the damage estimate count the extra shots', () => {
    const plain = compile(fanLine([])).stats;
    const one = compile(fanLine(['plus_one'])).stats;
    const two = compile(fanLine(times('plus_one', 2))).stats;
    expect(plain.projectilesPerPulse).toBe(1);
    expect(one.projectilesPerPulse).toBe(2);
    expect(two.projectilesPerPulse).toBe(3);
    expect(one.estDps / plain.estDps).toBeCloseTo(3 / 2, 12); // 2 + 1 against 2
    expect(one.damagePerShot).toBeCloseTo(1.5, 12);
  });

  it('a Capacitor after it collects per shot: both shots fire every third pulse', () => {
    const rec = compile(fanLine(['plus_one', 'capacitor'])).recipes;
    expect(rec.length).toBe(2);
    expect(rec.every(r => r.packet.ops.some(o => o.t === 'cap'))).toBe(true);
    const s = compile(fanLine(['plus_one', 'capacitor'])).stats;
    expect(s.projectilesPerPulse).toBeCloseTo(2, 12); // both shots share the 1-in-3 pulse, so two shots leave when it fires
  });
});

describe('+1 Projectile: the lane', () => {
  it('the shots of one ejector stand side by side, LANE_GAP (8 px) apart, centred', () => {
    expect(LANE_GAP).toBe(8);
    expect([0, 1, 2].map(k => laneOffset(k, 3))).toEqual([-8, 0, 8]);
    expect([0, 1].map(k => laneOffset(k, 2))).toEqual([-4, 4]);
    expect(laneOffset(0, 1)).toBe(0);
    const g = fanLine(times('plus_one', 2));
    const c = compile(g);
    const off = spawnOffsetsFor(c.recipes, g);
    const base = spawnOffsetsFor(compile(fanLine([])).recipes, g)[0];
    expect(off.map(o => o.x - base.x)).toEqual([-8, 0, 8]);
    expect(off.every(o => o.y === base.y)).toBe(true);
  });

  it('a sideways ejector (facing east) spreads its lane up and down instead', () => {
    const g = fanLine(['plus_one']);
    const c = compile(g);
    const east = c.recipes.map(r => ({ ...r, direction: 'E' as const }));
    const off = spawnOffsetsFor(east, g);
    expect(off[0].x).toBe(off[1].x);
    expect(off[1].y - off[0].y).toBe(8);
  });

  function gunFor(g: Grid, poolMax = 400) {
    const compiled = compile(g);
    const pool = new ProjectilePool(poolMax);
    const sys = new ProjectileSystem(pool);
    sys.modifiersTable = compiled.recipes.map(r => r.packet.mods);
    const gun = new Gun(pool, sys, compiled.recipes, spawnOffsetsFor(compiled.recipes, g), 0.25);
    const pulse = () => { gun.update(0.25, 270, 800); gun.fire(270, 800); };
    const alive = () => Array.from({ length: pool.max }, (_, i) => i).filter(i => pool.active[i]);
    return { pool, sys, gun, pulse, alive, compiled };
  }

  it('a pulse launches the shots side by side with their own damage', () => {
    const r = gunFor(fanLine(['plus_one']));
    r.pulse();
    const a = r.alive();
    expect(a.length).toBe(2);
    const byX = a.sort((p, q) => r.pool.x[p] - r.pool.x[q]);
    expect(r.pool.x[byX[1]] - r.pool.x[byX[0]]).toBeCloseTo(8, 5);
    expect(r.pool.damage[byX[0]]).toBe(2); // the main shot is the first recipe, on the left
    expect(r.pool.damage[byX[1]]).toBe(1);
  });

  it('Mirror after the block clones both shots; Mirror before it only the main one', () => {
    const after = gunFor(fanLine(['plus_one', 'mirror']));
    after.pulse();
    expect(after.alive().length).toBe(4);
    const before = gunFor(fanLine(['mirror', 'plus_one']));
    before.pulse();
    expect(before.alive().length).toBe(3);
  });

  it('Fuse after the block: ten pulses release one fused shot per shot', () => {
    const r = gunFor(fanLine(['plus_one', 'fuse']));
    for (let k = 0; k < 9; k++) r.pulse();
    expect(r.alive().length).toBe(0);
    r.pulse();
    expect(r.alive().length).toBe(2);
    const dmg = r.alive().map(i => r.pool.damage[i]).sort((a, b) => a - b);
    expect(dmg[0]).toBeCloseTo(10 * 1 * 2, 6); // ten base shots of 1, x2
    expect(dmg[1]).toBeCloseTo(10 * 2 * 2, 6); // ten main shots of 2, x2
  });

  it('Lone Shot after the block: the second shot of the lane sees the first one alive', () => {
    const r = gunFor(fanLine(['plus_one', 'lone_shot']));
    r.pulse();
    const a = r.alive().sort((p, q) => r.pool.x[p] - r.pool.x[q]);
    expect(r.pool.damage[a[0]]).toBeCloseTo(2 * loneShotMul(0), 9); // alone in the air
    expect(r.pool.damage[a[1]]).toBeCloseTo(1 * loneShotMul(1), 9); // one shot alive
  });

  it('respects the projectile pool limit: a full pool skips shots, nothing throws', () => {
    const r = gunFor(fanLine(times('plus_one', 7)), 5);
    for (let k = 0; k < 4; k++) r.pulse();
    expect(r.pool.count).toBeLessThanOrEqual(5);
    expect(r.pool.count).toBe(5);
  });
});

// ------------------------------------------------------------------ Reverse removed
describe('Reverse is removed (save version 10)', () => {
  it('the block, its trigger row and its price are gone', () => {
    expect(BLOCKS.reverse).toBeUndefined();
    expect(BLOCK_ECONOMY.reverse).toBeUndefined();
    expect(TIER_LOCKS.reverse).toBeUndefined();
    expect(TRIGGERS).not.toHaveProperty('reverse');
    expect(pickerBlocks().length).toBe(66);
  });

  it('the refund follows the price formula round(4800 x 1.3^(n-1)) per copy', () => {
    expect(removedBlockRefund('reverse', 1)).toBe(4800);
    expect(removedBlockRefund('reverse', 2)).toBe(4800 + 6240);
    expect(removedBlockRefund('reverse', 3)).toBe(4800 + 6240 + 8112);
    expect(removedBlockRefund('reverse', 0)).toBe(0);
    expect(removedBlockRefund('nothing', 3)).toBe(0);
    expect(migrateRemovedBlocks({ reverse: 2 }).credits).toBe(11040);
    expect(migrateRemovedBlocks({ flat_plus: 3 })).toEqual({ credits: 0, notice: null });
  });

  it('a v9 save with 3 copies loads at v10, the copies are gone and 19152 credits are refunded once, with a notice', () => {
    expect(PROGRESS_VERSION).toBe(12);
    const old = { version: 9, credits: 1000, owned: { reverse: 3, flat_plus: 2 }, levels: { reverse: 1 }, ownedHulls: ['dart'] };
    const p = loadProgress(JSON.stringify(old));
    expect(p.version).toBe(12);
    expect(p.credits).toBe(1000 + 19152);
    expect(p.owned).not.toHaveProperty('reverse');
    expect(p.owned.flat_plus).toBe(2);
    expect(p.notice).toMatch(/Reverse \(3\) removed from the game: .* credits refunded/);
    // The migrated save loads again unchanged (no second refund).
    const again = loadProgress(JSON.stringify({ ...p, notice: undefined }));
    expect(again.credits).toBe(p.credits);
    expect(again.version).toBe(12);
  });

  it('a v9 save without copies gets no refund and no notice; a v10 save is never refunded', () => {
    const p = loadProgress(JSON.stringify({ version: 9, credits: 50, owned: { flat_plus: 1 }, levels: {}, ownedHulls: ['dart'] }));
    expect(p.credits).toBe(50);
    expect(p.notice).toBeUndefined();
    const q = loadProgress(JSON.stringify({ version: 10, credits: 50, owned: { reverse: 4 }, levels: {}, ownedHulls: ['dart'] }));
    expect(q.credits).toBe(50);
  });

  it('placed copies are removed from saved circuits, counted, and the model leaves a one-time message', () => {
    const entries = [
      { x: 5, y: 8, blockId: 'reverse', level: 1, rotation: 0 },
      { x: 4, y: 8, blockId: 'flat_plus', level: 1, rotation: 0 },
      { x: 3, y: 8, blockId: 'reverse', level: 1, rotation: 0 },
    ];
    const raw = JSON.stringify({ version: 3, hulls: { shuttle: { active: 'A', slots: { A: entries, B: [] } } } });
    const loaded = loadBuilder(raw);
    expect(loaded.removedCopies).toBe(2);
    expect(loaded.hulls.shuttle.slots.A.some(e => e.blockId === 'reverse')).toBe(false);
    expect(loaded.hulls.shuttle.slots.A.some(e => e.blockId === 'flat_plus')).toBe(true);
    // The count is never written back, so the message shows once.
    expect(serializeBuilder({ ...loaded, removedCopies: undefined })).not.toContain('removedCopies');
    const mem: Record<string, string> = { 'mgbm.builder.v2': raw };
    const storage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    const model = new BuilderModel(storage, 'shuttle', new ProgressStore(storage));
    expect(model.store.data.notice).toMatch(/2 placed Reverse blocks taken off your circuits/);
    expect(mem['mgbm.builder.v2']).not.toContain('reverse');
    const model2 = new BuilderModel(storage, 'shuttle', new ProgressStore(storage));
    expect((model2.store.data.notice ?? '').match(/placed Reverse/g)?.length ?? 0).toBe(1); // still the one message, not a second
  });
});

// ------------------------------------------------------------------ curves stack like angles
const DT = 1 / 60;
function rig() {
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
  /** Steers only (the shot stays where it is, so the heading is read without leaving the screen). */
  const steer = (n = 1) => { for (let k = 0; k < n; k++) sys.steer(DT, enemies); };
  const move = () => { for (let i = 0; i < pool.max; i++) if (pool.active[i]) { pool.x[i] += pool.vx[i] * DT; pool.y[i] += pool.vy[i] * DT; } };
  const step = (n = 1) => { for (let k = 0; k < n; k++) { sys.steer(DT, enemies); move(); hash.clear(); for (const e of enemies) hash.insert(e.id, e.x, e.y); sys.processHits(enemies, hash, 1); } };
  return { pool, sys, enemies, rock, launch, steer, step };
}
const mods = (type: string, n = 1, extra: Record<string, unknown> = {}): Modifier[] => Array.from({ length: n }, () => ({ type, ...extra }));
const heading = (pool: ProjectilePool, i: number) => (Math.atan2(pool.vy[i], pool.vx[i]) * 180) / Math.PI;

describe('curves stack like angles', () => {
  it('the numbers: 30 degrees a second and 45 in all per copy, 4 copies = 120 and 180', () => {
    expect([1, 2, 3, 4].map(curveRateDeg)).toEqual([30, 60, 90, 120]);
    expect([1, 2, 3, 4].map(curveTotalDeg)).toEqual([45, 90, 135, 180]);
    expect([1, 4].map(randomCurveRateDeg)).toEqual([30, 120]);
    for (const id of ['curving_right', 'curving_left', 'random_curve']) {
      expect(capOf(id), id).toBe(4);
      expect(blockText(BLOCKS[id]).stack, id).not.toBeNull();
      expect(blockText(BLOCKS[id]).stack!.length).toBeLessThanOrEqual(STACK_MAX);
    }
  });

  it('one copy turns 30 degrees a second and stops after 45 degrees', () => {
    const r = rig();
    const i = r.launch(mods('curve', 1, { dir: 'right' }), 270, 500, 0, -600);
    r.steer(30);
    expect(heading(r.pool, i)).toBeCloseTo(-90 + 15, 3);
    r.steer(300);
    expect(heading(r.pool, i)).toBeCloseTo(-90 + 45, 3); // stays at the total
    expect(r.pool.curved[i]).toBeCloseTo(45, 3);
    expect(Math.hypot(r.pool.vx[i], r.pool.vy[i])).toBeCloseTo(600, 3);
  });

  it('the total is a hard cap even when a time step does not divide it (0.07 s steps never overshoot)', () => {
    const r = rig();
    const i = r.launch(mods('curve', 1, { dir: 'right' }), 270, 500, 0, -600);
    for (let k = 0; k < 100; k++) r.sys.steer(0.07, r.enemies);
    expect(r.pool.curved[i]).toBeCloseTo(45, 4);
    expect(heading(r.pool, i)).toBeCloseTo(-45, 3);
  });

  it('four copies turn 120 degrees a second for 180 degrees in all; Left turns the other way', () => {
    const r = rig();
    const right = r.launch(mods('curve', 4, { dir: 'right' }), 270, 500, 0, -600);
    const left = r.launch(mods('curve', 4, { dir: 'left' }), 270, 500, 0, -600);
    r.sys.modifiersTable = [mods('curve', 4, { dir: 'right' }), mods('curve', 4, { dir: 'left' })];
    r.pool.modIndex[left] = 1;
    r.steer(30); // 0.5 s: 60 degrees
    expect(heading(r.pool, right)).toBeCloseTo(-90 + 60, 3);
    expect(heading(r.pool, left)).toBeCloseTo(-90 - 60, 3);
    r.steer(300);
    expect(r.pool.curved[right]).toBeCloseTo(180, 3);
    expect(r.pool.curved[left]).toBeCloseTo(180, 3);
  });

  it('more copies curve faster and further than fewer', () => {
    const turned = (copies: number) => {
      const r = rig();
      const i = r.launch(mods('curve', copies, { dir: 'right' }), 270, 500, 0, -600);
      r.steer(30);
      const early = r.pool.curved[i];
      r.steer(400);
      return { early, total: r.pool.curved[i] };
    };
    const t = [1, 2, 3, 4].map(turned);
    for (let k = 1; k < 4; k++) { expect(t[k].early).toBeGreaterThan(t[k - 1].early); expect(t[k].total).toBeGreaterThan(t[k - 1].total); }
  });

  it('a Left and a Right on one path cancel; 3 Right and 1 Left act as 2 copies of Right', () => {
    const r = rig();
    const flat = r.launch([...mods('curve', 1, { dir: 'right' }), ...mods('curve', 1, { dir: 'left' })], 270, 500, 0, -600);
    r.steer(120);
    expect(heading(r.pool, flat)).toBeCloseTo(-90, 6);
    const r2 = rig();
    const mixed = r2.launch([...mods('curve', 3, { dir: 'right' }), ...mods('curve', 1, { dir: 'left' })], 270, 500, 0, -600);
    r2.steer(30);
    expect(heading(r2.pool, mixed)).toBeCloseTo(-90 + 30, 3); // 2 copies: 60 degrees a second for half a second
  });

  it('Random Curve weaves with a rate of 30 x copies degrees a second at most', () => {
    const maxRate = (copies: number) => {
      rng.reset(7);
      const r = rig();
      const i = r.launch(mods('random_curve', copies), 270, 500, 0, -600);
      let prev = heading(r.pool, i);
      let m = 0;
      for (let k = 0; k < 240; k++) { r.steer(); const h = heading(r.pool, i); m = Math.max(m, Math.abs(h - prev) / DT); prev = h; }
      return m;
    };
    const one = maxRate(1), four = maxRate(4);
    expect(one).toBeLessThanOrEqual(30.5);
    expect(four).toBeLessThanOrEqual(120.5);
    expect(four).toBeGreaterThan(one * 2);
  });
});

// ------------------------------------------------------------------ Upturn overrides
describe('Upturn takes over', () => {
  it('delay 0.4 s, shorter with more copies', () => {
    expect(UPTURN_DELAY).toBe(0.4);
    [0.4, 0.3, 0.225].forEach((d, k) => expect(upturnDelay(k + 1)).toBeCloseTo(d, 12));
  });

  it('after the delay, Curving stops steering: the shot turns straight up and stays', () => {
    const r = rig();
    const withUp = r.launch([...mods('curve', 4, { dir: 'right' }), ...mods('upturn')], 270, 500, 0, -600);
    r.steer(24); // 0.4 s: the curve has turned it 48 degrees
    expect(heading(r.pool, withUp)).toBeGreaterThan(-90 + 30);
    r.steer(120);
    expect(heading(r.pool, withUp)).toBeCloseTo(-90, 3); // straight up
    r.steer(120);
    expect(heading(r.pool, withUp)).toBeCloseTo(-90, 3); // and it stays
    // Without Upturn the same curve goes on to its full total.
    const r2 = rig();
    const without = r2.launch(mods('curve', 4, { dir: 'right' }), 270, 500, 0, -600);
    r2.steer(144);
    expect(r2.pool.curved[without]).toBeCloseTo(180, 3);
  });

  it('after the delay, Ship Magnet and Centreline no longer pull (the shot goes straight up)', () => {
    const run = (extra: Modifier[]) => {
      const r = rig();
      const i = r.launch([...mods('magnetized', 3), ...mods('centreline', 3), ...extra], 400, 300, -200, -500);
      r.pool.anchorX[i] = 100;
      r.sys.shipX = 100; r.sys.shipY = 800;
      r.steer(120);
      return r.pool.vx[i];
    };
    expect(Math.abs(run([]))).toBeGreaterThan(1); // the pulls keep bending it
    expect(Math.abs(run(mods('upturn')))).toBeLessThan(1e-3);
  });

  it('after the delay, Homing no longer steers', () => {
    const run = (extra: Modifier[]) => {
      const r = rig();
      r.rock(330, 450);
      const i = r.launch([...mods('homing', 3, { level: 1 }), ...extra], 270, 700, 0, -600);
      r.pool.age[i] = 1; // past any delay
      r.steer(5);
      return r.pool.vx[i];
    };
    expect(run([])).toBeGreaterThan(1);
    expect(Math.abs(run(mods('upturn')))).toBeLessThan(1e-3);
  });

  it('after the delay, Zigzag stops weaving', () => {
    const run = (extra: Modifier[]) => {
      const r = rig();
      const i = r.launch([...mods('zigzag'), ...extra], 270, 500, 0, -600);
      r.steer(90);
      return heading(r.pool, i);
    };
    expect(Math.abs(run([]) + 90)).toBeGreaterThan(1);
    expect(run(mods('upturn'))).toBeCloseTo(-90, 3);
  });

  it('extra copies start sooner: at 0.35 s two copies have overridden the curve, one has not', () => {
    const turned = (copies: number) => {
      const r = rig();
      const i = r.launch([...mods('curve', 4, { dir: 'right' }), ...mods('upturn', copies)], 270, 500, 0, -600);
      r.steer(21); // 0.35 s
      const a = r.pool.curved[i];
      r.steer(6);
      return { a, b: r.pool.curved[i] };
    };
    const one = turned(1), two = turned(2);
    expect(one.b).toBeGreaterThan(one.a); // still curving at 0.35 s
    expect(two.b).toBe(two.a); // overridden since 0.3 s
  });

  it('does NOT affect Orbit before launch, a waiting Mine or a Boomerang on its way back', () => {
    const o = rig();
    const orb = o.launch([...mods('orbit', 1, { level: 1 }), ...mods('upturn')], 270, 700, 0, -600);
    o.pool.age[orb] = 1;
    o.step(20);
    expect(o.pool.phase[orb]).toBe(PHASE_ORBIT);
    expect(Math.hypot(o.pool.x[orb] - 270, o.pool.y[orb] - 700)).toBeGreaterThan(10); // circling, not flying away up
    expect(o.pool.y[orb]).toBeGreaterThan(600);

    const m = rig();
    const mine = m.launch([...mods('mine', 1, { level: 1 }), ...mods('upturn')], 270, 700, 0, -600);
    for (let k = 0; k < 120 && m.pool.phase[mine] !== PHASE_MINE_WAIT; k++) m.step();
    expect(m.pool.phase[mine]).toBe(PHASE_MINE_WAIT);
    const y = m.pool.y[mine];
    m.step(60);
    expect(m.pool.phase[mine]).toBe(PHASE_MINE_WAIT);
    expect(m.pool.y[mine]).toBe(y);

    const b = rig();
    const boom = b.launch([...mods('boomerang', 1, { level: 1 }), ...mods('upturn')], 270, 700, 0, -600);
    for (let k = 0; k < 600 && b.pool.phase[boom] !== PHASE_BOOM_BACK; k++) b.step();
    expect(b.pool.phase[boom]).toBe(PHASE_BOOM_BACK);
    b.step(5);
    expect(b.pool.vy[boom]).toBeGreaterThan(0); // flying back DOWN to the ship, not turned up
  });
});

// ------------------------------------------------------------------ keys
describe('builder keys (pure mapping)', () => {
  const k = (key: string, o: Record<string, unknown> = {}) => keyAction({ key, ...o });
  it('maps every shortcut of the help list', () => {
    expect(k('r')).toBe('rotateRight');
    expect(k('R', { shiftKey: true })).toBe('rotateLeft');
    expect(k('q')).toBe('rotateLeft');
    expect(k('d')).toBe('delete');
    expect(k('Delete')).toBe('delete');
    expect(k('Backspace')).toBe('delete');
    expect(k('a')).toBe('autoOrient');
    expect(k('z', { ctrlKey: true })).toBe('undo');
    expect(k('y', { ctrlKey: true })).toBe('redo');
    expect(k('Z', { ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(k('z', { metaKey: true })).toBe('undo');
    expect(k('Escape')).toBe('escape');
    expect(k('f')).toBe('fly');
    expect(BUILD_KEY_HELP.length).toBe(6);
  });
  it('ignores typing in an input, other Ctrl combinations, Alt and unknown keys', () => {
    expect(k('r', { target: { tagName: 'INPUT' } })).toBeNull();
    expect(k('Backspace', { target: { tagName: 'textarea' } })).toBeNull();
    expect(k('d', { target: { tagName: 'DIV', isContentEditable: true } })).toBeNull();
    expect(k('d', { target: { tagName: 'DIV' } })).toBe('delete');
    expect(k('r', { ctrlKey: true })).toBeNull(); // reload
    expect(k('a', { ctrlKey: true })).toBeNull(); // select all
    expect(k('f', { altKey: true })).toBeNull();
    expect(k('x')).toBeNull();
    expect(k('r', { repeat: true })).toBeNull(); // no repeated rotation or fly
    expect(k('Backspace', { repeat: true })).toBe('delete');
  });
});

// ------------------------------------------------------------------ run summary numbers
describe('run summary stats', () => {
  it('average DPS = total damage / run time; K/M/B formatted; zero and NaN-safe', () => {
    expect(avgDps(5000, 10)).toBe(500);
    expect(avgDps(5000, 0)).toBe(0);
    expect(avgDps(0, 10)).toBe(0);
    expect(avgDps(NaN, 10)).toBe(0);
    expect(shotLines({ bestShot: 12345, totalDamage: 2_500_000 }, 10)).toEqual({ bestShot: '12.3K', avgDps: '250K' });
    expect(shotLines({ bestShot: 7, totalDamage: 7000 }, 10)).toEqual({ bestShot: '7', avgDps: '700' });
    expect(shotLines(undefined, 10)).toBeNull();
  });

  it('the projectile system records the largest hit and the total damage of a run', () => {
    const r = rig();
    r.rock(270, 300, 1e9);
    r.rock(270, 200, 1e9);
    const a = r.launch([], 270, 330, 0, -600, 40);
    r.step(3);
    expect(r.pool.active[a]).toBe(0);
    const b = r.launch([], 270, 230, 0, -600, 700);
    r.step(3);
    expect(r.pool.active[b]).toBe(0);
    expect(r.sys.runStats.bestShot).toBe(700);
    expect(r.sys.runStats.totalDamage).toBe(740);
    expect(flyRunResult({ credits: 1, kills: 2, time: 3, maxTier: 1, wave: 1, projSys: r.sys }).shots).toEqual({ bestShot: 700, totalDamage: 740 });
  });

  it('a hit that is NaN or not positive counts for nothing and the total never becomes Infinity', () => {
    const r = rig();
    r.rock(270, 300, 1e9);
    r.launch([], 270, 330, 0, -600, 1e308);
    r.step(3);
    r.rock(270, 200, 1e9);
    r.launch([], 270, 230, 0, -600, 1e308);
    r.step(3);
    expect(Number.isFinite(r.sys.runStats.totalDamage)).toBe(true);
    expect(Number.isFinite(r.sys.runStats.bestShot)).toBe(true);
  });
});

// ------------------------------------------------------------------ shot looks
describe('shot looks by damage', () => {
  it('log bands: under 10, 10-99, 100-999, 1K-9.9K, 10K+', () => {
    expect(SHOT_LOOK_BANDS).toEqual([10, 100, 1000, 10000]);
    const cases: [number, number][] = [[1, 0], [9.99, 0], [10, 1], [99.9, 1], [100, 2], [999, 2], [1000, 3], [9999, 3], [10000, 4], [1e12, 4], [Infinity, 4]];
    for (const [d, band] of cases) expect(shotBand(d), String(d)).toBe(band);
    for (const bad of [0, -5, NaN]) expect(shotBand(bad), String(bad)).toBe(0);
  });
  it('every band has its own shape or colour (chunk 21b redraw: dash, bar, diamond, bolt, star; see tests/chunk21b.test.ts)', () => {
    expect(SHOT_LOOKS.map(l => l.shape)).toEqual(['bar', 'bar', 'diamond', 'bolt', 'star']);
    expect(new Set(SHOT_LOOKS.map(l => l.color)).size).toBe(SHOT_LOOKS.length);
    expect(shotLookFor(5)).toBe(SHOT_LOOKS[0]);
    expect(shotLookFor(50000)).toBe(SHOT_LOOKS[4]);
  });
});

// ------------------------------------------------------------------ repricing
describe('the 16 blocks that moved to campaign tiers are repriced', () => {
  /** Credits of half a wall at the unlock tier ("run", reports/chunk20b/prices.md) and how many runs the first copy should cost. */
  const RUN: Record<string, [number, number, number]> = {
    cleaver: [24, 2.5, 60], mine: [44, 2.5, 110], random_router: [44, 2.5, 110], static_charge: [55, 2.5, 140], overkill_spill: [94, 5, 460],
    frostbite: [137, 2.5, 340], corrosion: [215, 2.5, 540], gravity_well: [300, 2.5, 750], culling_bolt: [369, 2.5, 920],
    residue_seed: [452, 5, 2260], orbit: [581, 2.5, 1450], capacitor: [903, 2.5, 2260], executioner: [1149, 2.5, 2870],
    alternator: [1388, 2.5, 3470], fission_catalyst: [1675, 2.5, 4190], chain_lightning: [1921, 5, 9600],
  };
  it('the first copy costs about 2.5 runs (5 for Overkill Spill, Residue Seed and Chain Lightning)', () => {
    expect(Object.keys(RUN).length).toBe(16);
    for (const [id, [run, runs, price]] of Object.entries(RUN)) {
      expect(BLOCK_ECONOMY[id].base, id).toBe(price);
      expect(Math.abs(BLOCK_ECONOMY[id].base / run - runs) / runs, `${id}: ${BLOCK_ECONOMY[id].base / run} runs`).toBeLessThan(0.07);
    }
  });
  it('they are still on their campaign tiers, and growth and caps did not change', () => {
    for (const id of Object.keys(RUN)) expect(TIER_LOCKS[id], id).toBeGreaterThan(0);
    expect(BLOCK_ECONOMY.mine.growth).toBe(1.3);
    expect(BLOCK_ECONOMY.chain_lightning.cap).toBeNull();
    expect(BLOCK_ECONOMY.capacitor.cap).toBe(1);
  });
});
