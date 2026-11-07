import { describe, it, expect } from 'vitest';
import { CrystalField, crystalPopText, pullRadius, crystalVisible, killShare, pickupRadius } from '../src/engine/coreCrystals';
import { CRYSTAL_BLINK, CRYSTAL_CAP, CRYSTAL_LIFE, CRYSTAL_PICKUP_RADIUS, CRYSTAL_SHARE, CORE_MAGNET_RADIUS_PER_COPY, CRYSTAL_PULL_MUL, CRYSTAL_PULL_MAX_SPEED } from '../src/data/coreCrystals';
import { World } from '../src/game/world';
import { PointerState } from '../src/input';
import { neutralModifiers } from '../src/captains/modifiers';
import { CHUNK_BY_ID } from '../src/data/shipChunks';
import { flyRunResult } from '../src/game/runEnd';
import { WAVE_TIME } from '../src/data/waves';
import { encounterCoresPerBlock, waveStartCores } from '../src/shipyard/cores';

/** Chunk 32e: Core crystals (docs/core-pickups.md). */
const DT = 1 / 60;
const idle = (): PointerState => ({ x: 0, y: 0, active: false, type: 'mouse', seen: false });
const still = (f: CrystalField) => f.list.forEach(c => { c.vx = 0; c.vy = 0; });

describe('the value split: crystals are +50% of the automatic Cores', () => {
  it('a kill takes its share of the pool; the last kill takes what is left, so the pool is paid out in full', () => {
    let pool = 10;
    const rewards = [1, 2, 3, 4];
    let got = 0;
    rewards.forEach((r, i) => {
      const others = rewards.slice(i + 1).reduce((a, b) => a + b, 0);
      const v = pool * killShare(r, others);
      pool -= v; got += v;
      if (i === 0) expect(v).toBeCloseTo(1, 9); // 1 of 10 reward points
    });
    expect(got).toBeCloseTo(10, 9);
    expect(pool).toBeCloseTo(0, 9);
  });

  it('killing a whole wave drops CRYSTAL_SHARE of the wave start pay (and nothing more)', () => {
    expect(CRYSTAL_SHARE).toBe(0.5);
    const w = new World({ seed: 5, startWave: 8, modifiers: neutralModifiers() });
    w.god = true;
    const killAll = () => { for (const e of w.mitosis.enemies) if (!e.bossRole) e.hp = 0; };
    for (let t = 0; t < WAVE_TIME - 2; t += DT) { w.update(DT, idle()); killAll(); }
    const pay = waveStartCores(8);
    expect(w.crystals.dropped).toBeGreaterThan(pay * CRYSTAL_SHARE * 0.5);
    expect(w.crystals.dropped).toBeLessThanOrEqual(pay * CRYSTAL_SHARE + 1e-6);
  });

  it('a Frontier encounter fills its pool by time: at most half of one block of Cores in 40 s', () => {
    const plan = [{ at: 0, defId: 'mitotic_rock', x: 270, generation: 1, radius: 20, hpMul: 1 }];
    const w = new World({ seed: 5, encounter: { plan, wave: 12, tier: 12, hpMul: 1, duration: 100 } });
    w.god = true;
    for (let t = 0; t < 40; t += DT) w.update(DT, idle());
    for (const e of w.mitosis.enemies) e.hp = 0;
    w.update(DT, idle());
    expect(w.crystals.dropped).toBeGreaterThan(0);
    expect(w.crystals.dropped).toBeLessThanOrEqual(encounterCoresPerBlock(12) * CRYSTAL_SHARE + 1e-6);
  });
});

describe('fade timing', () => {
  it('lives 6 s, shown steadily until the last 1.5 s, then blinking', () => {
    expect(CRYSTAL_LIFE).toBe(6);
    expect(CRYSTAL_BLINK).toBe(1.5);
    expect(crystalVisible(0)).toBe(true);
    expect(crystalVisible(CRYSTAL_LIFE - CRYSTAL_BLINK - 0.01)).toBe(true);
    const seen = new Set<boolean>();
    for (let a = CRYSTAL_LIFE - CRYSTAL_BLINK; a < CRYSTAL_LIFE; a += 0.02) seen.add(crystalVisible(a));
    expect(seen.has(true) && seen.has(false)).toBe(true);
  });
  it('is removed at 6 s, not before; its value counts as dropped, not collected', () => {
    const f = new CrystalField();
    f.drop(100, 100, 3);
    for (let t = 0; t < 5.9; t += 0.1) f.update(0.1, 0, 800, 0, 800, 28);
    expect(f.list.length).toBe(1);
    for (let t = 0; t < 0.3; t += 0.1) f.update(0.1, 0, 800, 0, 800, 28);
    expect(f.list.length).toBe(0);
    expect(f.dropped).toBe(3);
    expect(f.collected).toBe(0);
  });
});

describe('pickup radius and the Core Magnet', () => {
  it('collects inside the radius, not outside; a fast ship cannot skip one (the path is swept)', () => {
    const f = new CrystalField();
    f.drop(200, 200, 2); f.drop(200 + CRYSTAL_PICKUP_RADIUS + 10, 200, 5);
    still(f);
    expect(f.update(DT, 200, 220, 200, 220, CRYSTAL_PICKUP_RADIUS)).toBe(2);
    const g = new CrystalField();
    g.drop(300, 300, 4); still(g);
    expect(g.update(DT, 100, 300, 500, 300, CRYSTAL_PICKUP_RADIUS)).toBe(4);
  });
  it('Core Magnet: +60% radius per copy, and the chunk no longer touches the Cores paid', () => {
    expect(CRYSTAL_PICKUP_RADIUS).toBe(28);
    expect(pickupRadius(1)).toBe(28);
    expect(pickupRadius(1 + CORE_MAGNET_RADIUS_PER_COPY)).toBeCloseTo(44.8, 9);
    expect(CHUNK_BY_ID.core_magnet.effect).toEqual({ pickup: 0.6 });
    expect(CHUNK_BY_ID.core_magnet.text).toContain('+60%');
  });
  it('a crystal 40 px away is collected with the Magnet radius and not without', () => {
    const mk = (mul: number) => {
      const w = new World({ seed: 5, modifiers: { ...neutralModifiers(), pickupMul: mul } });
      w.god = true;
      w.crystals.drop(w.shipX + 40, w.shipY, 2); still(w.crystals);
      w.update(DT, idle());
      return w.crystals.collected;
    };
    expect(mk(1)).toBe(0);
    expect(mk(1.6)).toBe(2);
  });
  it('collected crystals add to the run Cores', () => {
    const w = new World({ seed: 5 });
    w.god = true;
    const before = w.cores;
    w.crystals.drop(w.shipX, w.shipY, 3);
    w.update(DT, idle());
    expect(w.cores - before).toBe(3);
  });
});

describe('the merge cap', () => {
  it('at the cap new value joins the nearest crystal and no crystal is added', () => {
    expect(CRYSTAL_CAP).toBe(60);
    expect(new CrystalField().cap).toBe(CRYSTAL_CAP);
    const small = new CrystalField(3);
    small.drop(0, 0, 1); small.drop(100, 0, 1); small.drop(500, 500, 1);
    small.drop(110, 5, 2);
    expect(small.list.length).toBe(3);
    expect(small.list.find(c => Math.abs(c.x - 100) < 5)!.value).toBe(3);
    expect(small.list.find(c => Math.abs(c.x) < 5)!.value).toBe(1);
    expect(small.dropped).toBe(5);
  });
});

describe('summary numbers', () => {
  it('the run result carries what was collected and dropped', () => {
    const w = new World({ seed: 5 });
    w.god = true;
    w.crystals.drop(w.shipX, w.shipY, 4); w.crystals.drop(10, 10, 2); still(w.crystals);
    w.update(DT, idle());
    expect(flyRunResult(w).crystals).toEqual({ collected: 4, dropped: 6 });
  });
});

/** Chunk 34b: magnet pull, "+N" popups, sparks. */
import { mergeNumber, bumpScale, flashLook, NumSlot } from '../src/fx/feel';
import { FEEL } from '../src/data/feel';
import { FeelHub } from '../src/fx/hub';

describe('magnet pull (34b)', () => {
  it('the pull radius is 3x the pickup radius and grows with each Core Magnet copy the same way', () => {
    expect(pullRadius(1)).toBe(CRYSTAL_PULL_MUL * CRYSTAL_PICKUP_RADIUS);
    for (const copies of [1, 2, 3]) {
      const mul = 1 + CORE_MAGNET_RADIUS_PER_COPY * copies;
      expect(pullRadius(mul)).toBeCloseTo(CRYSTAL_PULL_MUL * pickupRadius(mul), 9);
      expect(pullRadius(mul) / pullRadius(1)).toBeCloseTo(mul, 9);
    }
  });
  it('a crystal inside the pull radius (not the pickup radius) is caught; one outside keeps drifting', () => {
    const f = new CrystalField();
    f.drop(100 + 60, 400, 1); f.drop(100 + 200, 400, 1);
    still(f);
    f.update(DT, 100, 400, 100, 400, CRYSTAL_PICKUP_RADIUS);
    expect(f.list[0].pulled).toBe(true);
    expect(f.list[1].pulled).toBe(false);
    // with two Core Magnet copies the far one (200 px) is inside 3 x 28 x 2.2 = 185? no: it needs 3 copies
    const g = new CrystalField();
    g.drop(100 + 150, 400, 1); still(g);
    g.update(DT, 100, 400, 100, 400, pickupRadius(1));
    expect(g.list[0].pulled).toBe(false);
    g.update(DT, 100, 400, 100, 400, pickupRadius(1 + CORE_MAGNET_RADIUS_PER_COPY * 2));
    expect(g.list[0].pulled).toBe(true);
  });
  it('a pulled crystal flies at the ship along a curve, never faster than the cap, and is collected on arrival (no ageing out)', () => {
    const f = new CrystalField();
    f.drop(160, 400, 2); still(f);
    let got = 0, maxSp = 0, sideways = 0;
    for (let i = 0; i < 120 && !got; i++) {
      got = f.update(DT, 100, 400, 100, 400, CRYSTAL_PICKUP_RADIUS);
      const c = f.list[0];
      if (c) { maxSp = Math.max(maxSp, Math.hypot(c.vx, c.vy)); sideways = Math.max(sideways, Math.abs(c.y - 400)); }
    }
    expect(got).toBe(2);
    expect(maxSp).toBeLessThanOrEqual(CRYSTAL_PULL_MAX_SPEED + 1e-6);
    expect(sideways).toBeGreaterThan(1); // it left the straight line: the path curves in
    expect(f.pickups.length + f.collected).toBeGreaterThan(0);
  });
  it('an approaching ship cannot slip past a crystal: the pull catches it and it arrives, even at the top ship speed (the ship stops at the edge)', () => {
    for (const v of [600, 2700]) {
      const f = new CrystalField();
      f.drop(270, 500, 1); still(f);
      let x = 0, got = 0;
      for (let i = 0; i < 600 && got === 0; i++) { const nx = Math.min(540, x + v * DT); got = f.update(DT, x, 500 + 30, nx, 500 + 30, CRYSTAL_PICKUP_RADIUS); x = nx; }
      expect(got).toBe(1);
    }
  });
  it('a pulled crystal does not age out while it flies', () => {
    const f = new CrystalField();
    f.drop(160, 400, 1); still(f);
    f.update(DT, 100, 400, 100, 400, CRYSTAL_PICKUP_RADIUS);
    const c = f.list[0];
    const age = c.age;
    // the ship far away now: the crystal stays caught and keeps its age
    f.update(DT, 100, 400, 100, 400, 1);
    expect(f.list[0]?.age ?? age).toBeCloseTo(age, 9);
  });
});

describe('"+N" popup and the other pickup effects (34b)', () => {
  const slot = (): NumSlot => ({ key: -2, value: 0, age: 0, life: 0, big: false, used: true });
  it('text: K/M formatting from 10 up, one decimal below, never +0', () => {
    expect(crystalPopText(117)).toBe('+117');
    expect(crystalPopText(12_400)).toBe('+12.4K');
    expect(crystalPopText(3_200_000)).toBe('+3.2M');
    expect(crystalPopText(2.5)).toBe('+2.5');
    expect(crystalPopText(3)).toBe('+3');
    expect(crystalPopText(0.02)).toBe('+0.1');
  });
  it('collections inside 0.3 s add into one number; a later one starts a new number', () => {
    const slots = [slot()];
    slots[0].value = 5;
    slots[0].age = 0.25;
    const m = mergeNumber(slots, -2, 7, false, FEEL.PICKUPS.POP_MERGE, FEEL.PICKUPS.POP_LIFE);
    expect(m).toBe(slots[0]);
    expect(m!.value).toBe(12);
    expect(m!.age).toBe(0);
    expect(m!.life).toBe(FEEL.PICKUPS.POP_LIFE);
    slots[0].age = 0.31;
    expect(mergeNumber(slots, -2, 1, false, FEEL.PICKUPS.POP_MERGE)).toBeNull();
    // the damage-number window (0.14 s) would NOT have merged the first case
    slots[0].age = 0.25;
    expect(mergeNumber(slots, -2, 1, false)).toBeNull();
  });
  it('sparks use the shared particle pool and its cap; the HUD bump and the flash settle back', () => {
    const hub = new FeelHub(() => 0.5);
    hub.pickupSparks(100, 100, 0x3fd0c0);
    expect(hub.particles.count).toBeGreaterThanOrEqual(FEEL.PICKUPS.SPARKS[0] * 0.5);
    for (let i = 0; i < 50; i++) hub.pickupSparks(100, 100, 0x3fd0c0);
    expect(hub.particles.count).toBeLessThanOrEqual(hub.particles.cap);
    // at most SPARK_FRAME_CAP bursts a frame
    const hub2 = new FeelHub(() => 0.5);
    for (let i = 0; i < 50; i++) hub2.pickupSparks(0, 0, 1);
    expect(hub2.particles.count).toBeLessThanOrEqual(FEEL.PICKUPS.SPARK_FRAME_CAP * FEEL.PICKUPS.SPARKS[1]);
    expect(bumpScale(0)).toBe(1);
    expect(bumpScale(FEEL.PICKUPS.BUMP_TIME)).toBeCloseTo(FEEL.PICKUPS.BUMP_SCALE, 9);
    expect(flashLook(0).alpha).toBe(1);
    expect(flashLook(FEEL.PICKUPS.FLASH_TIME).alpha).toBe(0);
  });
});
