import { describe, it, expect } from 'vitest';
import { CrystalField, crystalLine, crystalVisible, killShare, pickupRadius } from '../src/engine/coreCrystals';
import { CRYSTAL_BLINK, CRYSTAL_CAP, CRYSTAL_LIFE, CRYSTAL_PICKUP_RADIUS, CRYSTAL_SHARE, CORE_MAGNET_RADIUS_PER_COPY } from '../src/data/coreCrystals';
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
  it('the line reads "Cores collected 120 / 180 (67%)"', () => {
    expect(crystalLine(120, 180)).toBe('Cores collected 120 / 180 (67%)');
    expect(crystalLine(0, 0)).toBe('Cores collected 0 / 0 (100%)');
    expect(crystalLine(0.7, 2.2)).toBe('Cores collected 1 / 2 (32%)'); // fractions are rounded, the percentage is exact
  });
  it('the run result carries what was collected and dropped', () => {
    const w = new World({ seed: 5 });
    w.god = true;
    w.crystals.drop(w.shipX, w.shipY, 4); w.crystals.drop(10, 10, 2); still(w.crystals);
    w.update(DT, idle());
    expect(flyRunResult(w).crystals).toEqual({ collected: 4, dropped: 6 });
  });
});
