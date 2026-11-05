import { describe, expect, it } from 'vitest';
import { FEEL } from '../src/data/feel';
import { bannerPunch, FrameBudget, HitStop, mergeNumber, NumSlot, popScale, Shake } from '../src/fx/feel';
import { FeelHub } from '../src/fx/hub';
import { ParticleSystem, RingList } from '../src/fx/particles';
import { migrateSettings } from '../src/ui/settings';

const seeded = () => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };

describe('Shake', () => {
  it('adds trauma by size and stops at the size ceiling', () => {
    const s = new Shake(seeded());
    for (let i = 0; i < 10; i++) s.add('small');
    expect(s.trauma).toBeCloseTo(FEEL.SHAKE.CEIL.small);
    s.add('big');
    expect(s.trauma).toBeGreaterThan(FEEL.SHAKE.CEIL.small);
    for (let i = 0; i < 10; i++) s.add('big');
    expect(s.trauma).toBeLessThanOrEqual(1);
  });
  it('decays to zero and the offset follows trauma squared', () => {
    const s = new Shake(seeded());
    s.add('big');
    const a1 = s.amplitude;
    s.trauma = s.trauma / 2;
    expect(s.amplitude).toBeCloseTo(a1 / 4);
    for (let i = 0; i < 120; i++) s.update(1 / 60);
    expect(s.trauma).toBe(0);
    expect(s.offset()).toEqual({ x: 0, y: 0 });
  });
  it('is capped small, scaled by Low and silent when Off', () => {
    const s = new Shake(() => 1); // always the extreme
    s.add('big');
    s.trauma = 1;
    expect(s.offset().x).toBeCloseTo(FEEL.SHAKE.MAX_OFFSET);
    s.mode = 'low';
    expect(s.offset().x).toBeCloseTo(FEEL.SHAKE.MAX_OFFSET * FEEL.SHAKE.LOW_SCALE);
    s.mode = 'off';
    s.trauma = 0;
    s.add('big');
    expect(s.trauma).toBe(0);
    expect(s.offset()).toEqual({ x: 0, y: 0 });
  });
});

describe('HitStop', () => {
  it('freezes for the kind\'s duration, then lets go', () => {
    const h = new HitStop();
    h.request('bossDeath');
    let frames = 0;
    while (h.step(1 / 60)) frames++;
    expect(frames).toBe(Math.ceil(FEEL.STOP.BOSS_DEATH * 60));
    h.request('crash');
    expect(h.left).toBeCloseTo(FEEL.STOP.CRASH);
    expect(FEEL.STOP.BOSS_DEATH).toBeGreaterThanOrEqual(0.06);
    expect(FEEL.STOP.BOSS_DEATH).toBeLessThanOrEqual(0.09);
  });
  it('a big hit freezes 30 ms and then waits its cool-down', () => {
    const h = new HitStop();
    h.request('big');
    expect(h.left).toBeCloseTo(0.03);
    while (h.step(1 / 60));
    h.request('big');
    expect(h.left).toBe(0); // still cooling down
    for (let i = 0; i < 60; i++) h.step(1 / 60);
    h.request('big');
    expect(h.left).toBeCloseTo(0.03);
  });
  it('does nothing when switched off, and never freezes without a request', () => {
    const h = new HitStop();
    expect(h.step(1 / 60)).toBe(false);
    h.on = false;
    h.request('crash');
    expect(h.step(1 / 60)).toBe(false);
  });
});

describe('Particles', () => {
  it('never holds more than the cap and counts refusals', () => {
    const p = new ParticleSystem();
    const r = seeded();
    for (let i = 0; i < 100; i++) p.burst(0, 0, 20, [0xffffff], r);
    expect(p.count).toBe(FEEL.PARTICLES.CAP_HIGH);
    expect(p.refused).toBeGreaterThan(0);
  });
  it('Low has a smaller cap and smaller bursts', () => {
    const hi = new ParticleSystem(), lo = new ParticleSystem();
    lo.mode = 'low';
    hi.burst(0, 0, 8, [1], seeded());
    lo.burst(0, 0, 8, [1], seeded());
    expect(lo.count).toBe(4);
    expect(hi.count).toBe(8);
    for (let i = 0; i < 100; i++) lo.burst(0, 0, 20, [1], seeded());
    expect(lo.count).toBe(FEEL.PARTICLES.CAP_LOW);
  });
  it('particles fade out and free their slots', () => {
    const p = new ParticleSystem();
    p.burst(0, 0, 8, [1], seeded());
    for (let i = 0; i < 60; i++) p.update(1 / 60);
    expect(p.count).toBe(0);
  });
  it('the ring list is capped', () => {
    const r = new RingList();
    for (let i = 0; i < 100; i++) r.add({ x: 0, y: 0, r0: 1, r1: 10, w: 0, h: 0, life: 1, color: 1 });
    expect(r.list.length).toBe(FEEL.RINGS.CAP);
    r.update(2);
    expect(r.list.length).toBe(0);
  });
});

describe('FeelHub', () => {
  it('a wall block gives 4-8 shards in its colour and a hard one also shakes a little', () => {
    const h = new FeelHub(seeded());
    h.blockDestroyed(10, 10, 0x6fbf73, false);
    expect(h.particles.count).toBeGreaterThanOrEqual(4);
    expect(h.particles.count).toBeLessThanOrEqual(8);
    expect(h.particles.color[0]).toBe(0x6fbf73);
    expect(h.shake.trauma).toBe(0);
    h.blockDestroyed(10, 10, 0x6fbf73, true);
    expect(h.shake.trauma).toBeGreaterThan(0);
  });
  it('at most SPARK_FRAME_CAP spark bursts a frame; none with Particles stuck at the cap', () => {
    const h = new FeelHub(seeded());
    for (let i = 0; i < 50; i++) h.spark(0, 0, 1);
    expect(h.particles.count).toBeLessThanOrEqual(FEEL.PARTICLES.SPARK_FRAME_CAP * FEEL.PARTICLES.SPARKS[1]);
    h.update(1 / 60);
    const before = h.particles.count;
    h.spark(0, 0, 1);
    expect(h.particles.count).toBeGreaterThan(before - 1);
  });
  it('the muzzle flash is off at a high pulse rate', () => {
    const h = new FeelHub(seeded());
    expect(h.muzzle(0, 0, FEEL.PARTICLES.MUZZLE_MAX_RATE + 1, 1)).toBe(false);
    expect(h.muzzle(0, 0, 3, 1)).toBe(true);
  });
  it('an AoE adds a ring and a small shake; the boss death queues a chain, shakes big and stops', () => {
    const h = new FeelHub(seeded());
    h.aoe(0, 0, 50, 1);
    expect(h.rings.list.length).toBe(1);
    expect(h.shake.trauma).toBeCloseTo(FEEL.SHAKE.ADD.small);
    h.bossDeath(100, 100, 100, 100, [1, 2]);
    expect(h.shake.trauma).toBeGreaterThan(0.9);
    expect(h.stop.left).toBeCloseTo(FEEL.STOP.BOSS_DEATH);
    expect(h.pendingBlasts).toBe(FEEL.PARTICLES.BOSS_BLASTS);
    for (let i = 0; i < 120; i++) h.update(1 / 60);
    expect(h.pendingBlasts).toBe(0);
  });
  it('a crash shakes big, stops and makes shards and a shockwave', () => {
    const h = new FeelHub(seeded());
    h.crash(5, 5, [1, 2, 3]);
    expect(h.shake.trauma).toBeGreaterThan(0.9);
    expect(h.stop.left).toBeCloseTo(FEEL.STOP.CRASH);
    expect(h.particles.count).toBe(FEEL.PARTICLES.CRASH_SHARDS);
    expect(h.rings.list.length).toBe(1);
  });
  it('drops to Low particles after the frame budget is exceeded for a few seconds, and stays there', () => {
    const h = new FeelHub(seeded());
    h.applySettings({ shake: 'normal', particles: 'high', hitStop: true });
    for (let i = 0; i < 80; i++) h.update(0.05); // 4 s of 50 ms frames
    expect(h.autoDropped).toBe(true);
    expect(h.particles.mode).toBe('low');
    h.applySettings({ shake: 'normal', particles: 'high', hitStop: true });
    expect(h.particles.mode).toBe('low');
  });
  it('a boss losing 4 percent of its HP inside a second shakes a little', () => {
    const h = new FeelHub(seeded());
    h.bossHp(1000, 1000, 0.5);
    h.bossHp(900, 1000, 0.5);
    expect(h.shake.trauma).toBeGreaterThan(0);
    const h2 = new FeelHub(seeded());
    h2.bossHp(1000, 1000, 0.5);
    h2.bossHp(999, 1000, 0.5);
    expect(h2.shake.trauma).toBe(0);
  });
});

describe('FrameBudget', () => {
  it('does not trip on steady good frames or on a single spike', () => {
    const b = new FrameBudget();
    for (let i = 0; i < 600; i++) expect(b.step(1 / 60)).toBe(false);
    expect(b.step(0.3)).toBe(false);
    for (let i = 0; i < 60; i++) b.step(1 / 60);
    expect(b.dropped).toBe(false);
  });
});

describe('damage numbers', () => {
  const slot = (key: number, age: number): NumSlot => ({ key, value: 5, age, life: 0.3, big: false, used: true });
  it('merges hits on the same target inside the window instead of stacking', () => {
    const slots = [slot(7, 0.05)];
    const m = mergeNumber(slots, 7, 3, false);
    expect(m).toBe(slots[0]);
    expect(slots[0].value).toBe(8);
    expect(slots[0].age).toBe(0);
    expect(slots[0].life).toBe(FEEL.NUMBERS.LIFE);
  });
  it('does not merge another target, an old number or an unused slot', () => {
    expect(mergeNumber([slot(1, 0.01)], 2, 1, false)).toBeNull();
    expect(mergeNumber([slot(1, FEEL.NUMBERS.MERGE_WINDOW + 0.1)], 1, 1, false)).toBeNull();
    const dead = slot(1, 0); dead.used = false;
    expect(mergeNumber([dead], 1, 1, false)).toBeNull();
  });
  it('a big hit makes the merged number big and longer', () => {
    const s = [slot(4, 0.01)];
    mergeNumber(s, 4, 100, true);
    expect(s[0].big).toBe(true);
    expect(s[0].life).toBe(FEEL.NUMBERS.BIG_LIFE);
  });
  it('pops larger then settles to 1', () => {
    expect(popScale(0, false)).toBeCloseTo(FEEL.NUMBERS.POP_SCALE);
    expect(popScale(0, true)).toBeCloseTo(FEEL.NUMBERS.BIG_SCALE);
    expect(popScale(1, false)).toBe(1);
  });
});

describe('banner punch', () => {
  it('starts above and bigger, ends at rest', () => {
    const a = bannerPunch(0), b = bannerPunch(1);
    expect(a.dy).toBeCloseTo(-FEEL.BANNER.SLIDE_DIST);
    expect(a.scale).toBeCloseTo(FEEL.BANNER.PUNCH_SCALE);
    expect(b).toEqual({ dy: -0, scale: 1 });
  });
});

describe('settings', () => {
  it('has defaults and rejects bad values', () => {
    const d = migrateSettings({});
    expect(d.shake).toBe('normal');
    expect(d.particles).toBe('high');
    expect(d.hitStop).toBe(true);
    const bad = migrateSettings({ shake: 'wild', particles: 3, hitStop: 'yes' });
    expect(bad.shake).toBe('normal');
    expect(bad.particles).toBe('high');
    expect(bad.hitStop).toBe(true);
    const ok = migrateSettings({ shake: 'low', particles: 'low', hitStop: false });
    expect([ok.shake, ok.particles, ok.hitStop]).toEqual(['low', 'low', false]);
  });
});

// ---- engine events the feel pass reads (visual only)
import { Modifier } from '../src/engine/compilerTypes';
import { ProjectilePool } from '../src/engine/pools';
import { EnemyEntity, ProjectileSystem } from '../src/engine/projectiles';
import { SpatialHash } from '../src/engine/spatialHash';

function rig(hp: number) {
  const pool = new ProjectilePool(64);
  const sys = new ProjectileSystem(pool);
  const enemies: EnemyEntity[] = [{ id: 1, x: 270, y: 500, radius: 20, hp, maxHp: hp, armor: 0, shield: 0, maxShield: 0 }];
  const hash = new SpatialHash(540, 960, 64);
  const seenBig: boolean[] = [];
  sys.onHit = () => { seenBig.push(sys.hitBig); };
  const fire = (mods: Modifier[], damage: number) => {
    sys.modifiersTable = [mods];
    sys.shipX = 270; sys.shipY = 800;
    const i = pool.spawn(270, 800, 0, -600, damage, 0, 0);
    sys.init(i);
    for (let k = 0; k < 40; k++) {
      sys.steer(1 / 60, enemies);
      for (let j = 0; j < pool.max; j++) if (pool.active[j]) { pool.x[j] += pool.vx[j] / 60; pool.y[j] += pool.vy[j] / 60; }
      sys.updateStatus(1 / 60);
      hash.clear();
      for (const e of enemies) hash.insert(e.id, e.x, e.y);
      sys.processHits(enemies, hash, 1);
    }
  };
  return { sys, fire, seenBig };
}

describe('engine events for the feel pass', () => {
  it('a single shot that kills with 10x the target\'s HP is flagged big; a plain kill and a non-kill are not', () => {
    const a = rig(10); a.fire([], 100);
    expect(a.seenBig).toEqual([true]);
    const b = rig(10); b.fire([], 15);
    expect(b.seenBig).toEqual([false]);
    const c = rig(1000); c.fire([], 100);
    expect(c.seenBig).toEqual([false]);
    expect(c.sys.hitBig).toBe(false);
  });
  it('an AoE circle queues a blast event with its radius; a Rectangle queues a w x h area', () => {
    const a = rig(100000); a.fire([{ type: 'aoe_circle', level: 1 }], 100);
    expect(a.sys.blastEvents.length).toBe(1);
    expect(a.sys.blastEvents[0].r).toBeGreaterThan(0);
    expect(a.sys.blastEvents[0].w).toBe(0);
  });
  it('without an AoE no blast is queued', () => {
    const a = rig(100000); a.fire([], 100);
    expect(a.sys.blastEvents.length).toBe(0);
  });
});
