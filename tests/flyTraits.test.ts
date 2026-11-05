import { describe, it, expect } from 'vitest';
import { CHUNK_BY_ID, CHUNKS, duplicateShapes, validateChunk, GROWTH_TRAIT } from '../src/data/shipChunks';
import { designOf, designStats } from '../src/shipyard/design';
import { flyTraitsOf, NEUTRAL_FLY, FlyTraits } from '../src/shipyard/flyTraits';
import { REPAIR_IDLE_SECONDS, WAVE_SKIP_MAX, WAVE_TIME_MIN_MUL } from '../src/shipyard/constants';
import { applyHullTraits } from '../src/shipyard/registry';
import { neutralModifiers } from '../src/captains/modifiers';
import { World } from '../src/game/world';
import { WaveDirector, PlannedSpawn } from '../src/game/waves';
import { isBossWave } from '../src/data/bosses';
import { waveStartCores } from '../src/shipyard/cores';
import { WAVE_TIME } from '../src/data/waves';
import { PointerState } from '../src/input';

/**
 * Chunk 32c: the five Free Fly trait chunks (Faster / Longer Waves, Wave Skipper, Repair Bay, Boss Bounty): each upside AND its downside,
 * stacking per copy, and "Free Fly only" (a Frontier encounter and the wall ignore them).
 */
const BASE_HULL = 100; // world.ts keeps it private
const DT = 1 / 60;
const idle = (): PointerState => ({ x: 0, y: 0, active: false, type: 'mouse', seen: false });
const run = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT, idle()); };
const fly = (over: Partial<FlyTraits>): FlyTraits => ({ ...NEUTRAL_FLY, ...over });
const worldWith = (f: Partial<FlyTraits>, opts: ConstructorParameters<typeof World>[0] = {}) =>
  new World({ seed: 5, ...opts, modifiers: { ...neutralModifiers(), fly: fly(f) } });
const eff = (id: string) => CHUNK_BY_ID[id].effect;

describe('the five Free Fly chunks: data', () => {
  const IDS = ['faster_waves', 'longer_waves', 'wave_skipper', 'repair_bay', 'boss_bounty'];
  it('exist as traits with the same price growth, valid shapes, 1-4 cells, and no two shapes alike', () => {
    for (const id of IDS) {
      const c = CHUNK_BY_ID[id];
      expect(c, id).toBeDefined();
      expect(c.kind).toBe('trait');
      expect(c.growth).toBe(GROWTH_TRAIT);
      expect(validateChunk(c), id).toEqual([]);
      const cells = c.rows.join('').split('_').length - 1;
      expect(cells).toBeGreaterThanOrEqual(1);
      expect(cells).toBeLessThanOrEqual(4);
      expect(c.text).toContain('Free Fly only');
    }
    expect(duplicateShapes()).toEqual([]);
    expect(CHUNKS.length).toBe(18);
  });

  it('every one has an upside and a downside', () => {
    expect(eff('faster_waves')).toEqual({ waveSpeed: 0.2, enemyHp: 0.1 });
    expect(eff('longer_waves')).toEqual({ waveLength: 0.3, wavePay: -0.1 });
    expect(eff('wave_skipper')).toEqual({ waveSkip: 0.1 });
    expect(eff('repair_bay')).toEqual({ repair: 0.02, flyDamage: -0.15 });
    expect(eff('boss_bounty')).toEqual({ bossCores: 0.5, bossHp: 0.25 });
  });
});

describe('flyTraitsOf: per copy and stacking', () => {
  it('nothing placed = neutral', () => {
    expect(flyTraitsOf([])).toEqual(NEUTRAL_FLY);
    expect(flyTraitsOf([undefined, eff('overdrive')])).toEqual(NEUTRAL_FLY);
  });
  it('Faster Waves: x0.8 the wave time and x1.1 enemy HP, per copy', () => {
    expect(flyTraitsOf([eff('faster_waves')])).toMatchObject({ waveTimeMul: 0.8, enemyHpMul: 1.1 });
    expect(flyTraitsOf([eff('faster_waves'), eff('faster_waves')])).toMatchObject({ waveTimeMul: 0.64, enemyHpMul: 1.21 });
  });
  it('Longer Waves: x1.3 the wave time and x0.9 the Cores a wave, per copy', () => {
    expect(flyTraitsOf([eff('longer_waves')])).toMatchObject({ waveTimeMul: 1.3, wavePayMul: 0.9 });
    expect(flyTraitsOf([eff('longer_waves'), eff('longer_waves')]).waveTimeMul).toBeCloseTo(1.69, 3);
  });
  it('Faster and Longer Waves together multiply', () => {
    expect(flyTraitsOf([eff('faster_waves'), eff('longer_waves')]).waveTimeMul).toBeCloseTo(1.04, 3);
  });
  it('Wave Skipper adds 10% a copy (capped); Repair Bay 2% a second and x0.85 damage; Boss Bounty +50% Cores and x1.25 HP', () => {
    expect(flyTraitsOf([eff('wave_skipper'), eff('wave_skipper')]).waveSkip).toBeCloseTo(0.2, 5);
    expect(flyTraitsOf(Array(20).fill(eff('wave_skipper'))).waveSkip).toBe(WAVE_SKIP_MAX);
    expect(flyTraitsOf(Array(20).fill(eff('faster_waves'))).waveTimeMul).toBe(WAVE_TIME_MIN_MUL);
    expect(flyTraitsOf([eff('repair_bay'), eff('repair_bay')])).toMatchObject({ repairRate: 0.04, damageMul: 0.722 });
    expect(flyTraitsOf([eff('boss_bounty'), eff('boss_bounty')])).toMatchObject({ bossCoresMul: 2, bossHpMul: 1.563 });
  });
  it('a design carries the totals in its stats; the old trait stats are untouched', () => {
    const withBay = designStats(designOf([[], [], ['front_gun'], ['wide_open', 'repair_bay']]))!;
    expect(withBay).not.toBeNull();
    expect(withBay.fly).toMatchObject({ repairRate: 0.02, damageMul: 0.85 });
    expect(withBay.damageMul).toBeCloseTo(0.7, 3); // only Wide Open: the Repair Bay downside is Free Fly only
    const withFaster = designStats(designOf([[], [], ['front_gun'], ['wide_open', 'faster_waves']]))!;
    expect(withFaster.fly).toMatchObject({ waveTimeMul: 0.8, enemyHpMul: 1.1 });
    expect(designStats(designOf([[], [], ['front_gun'], ['wide_open']]))!.fly).toEqual(NEUTRAL_FLY);
  });
});

describe('the run reads them in Free Fly only', () => {
  it('Repair Bay lowers the Free Fly damage, never the damage multiplier the wall reads', () => {
    expect(neutralModifiers().fly).toEqual(NEUTRAL_FLY);
    const m = { ...neutralModifiers(), fly: fly({ damageMul: 0.85 }) };
    expect(applyHullTraits(m, 'dart').damageMul).toBe(1);
    expect(worldWith({ damageMul: 0.85 }).projSys.bonus.damageMul).toBeCloseTo(0.85, 5);
    expect(worldWith({}).projSys.bonus.damageMul).toBe(1);
  });

  it('a Frontier encounter ignores every one of them', () => {
    const enc = { plan: [], wave: 12, tier: 12, hpMul: 1, duration: 100 };
    const w = worldWith({ damageMul: 0.5, waveTimeMul: 0.5, repairRate: 1, waveSkip: 1, enemyHpMul: 2 }, { encounter: enc });
    expect(w.flyT).toEqual(NEUTRAL_FLY);
    expect(w.projSys.bonus.damageMul).toBe(1);
  });

  it('FASTER WAVES: wave 2 starts at 32 s instead of 40; enemies have +10% HP (the downside)', () => {
    const f = worldWith({ waveTimeMul: 0.8, enemyHpMul: 1.1 }), n = worldWith({});
    f.god = n.god = true;
    run(f, 31); run(n, 31);
    expect(f.wave).toBe(1);
    run(f, 1.5); run(n, 1.5);
    expect(f.wave).toBe(2);
    expect(n.wave).toBe(1);
    expect((n.director as WaveDirector).waveTime).toBe(WAVE_TIME);
    const hpOf = (w: World) => Math.max(...w.mitosis.enemies.filter(e => e.maxHp < 1e12).map(e => e.maxHp));
    const a = worldWith({}, { startWave: 19 }), b = worldWith({ enemyHpMul: 1.1 }, { startWave: 19 });
    a.god = b.god = true;
    run(a, 6); run(b, 6);
    expect(hpOf(b)).toBeGreaterThan(hpOf(a));
    expect(hpOf(b) / hpOf(a)).toBeCloseTo(1.1, 1);
  });

  it('LONGER WAVES: a wave lasts 30% longer (52 s), and a wave start pays -10% Cores (the downside)', () => {
    const l = worldWith({ waveTimeMul: 1.3, wavePayMul: 0.9 });
    l.god = true;
    run(l, 41);
    expect(l.wave).toBe(1);
    run(l, 12);
    expect(l.wave).toBe(2);
    const a = worldWith({}, { startWave: 19 }), b = worldWith({ wavePayMul: 0.9 }, { startWave: 19 });
    run(a, 0.1); run(b, 0.1);
    expect(a.cores).toBe(waveStartCores(19));
    expect(b.cores).toBe(Math.floor(waveStartCores(19) * 0.9 + 1e-9));
    expect(b.cores).toBeLessThan(a.cores);
  });

  it('WAVE SKIPPER: skipped waves pay nothing and pass at once; a boss wave and wave 1 are never skipped', () => {
    const d = new WaveDirector(5, WAVE_TIME, 1);
    const out: PlannedSpawn[] = [];
    expect(d.update(0, 0, out)).toBe(1);
    expect(d.skipped).toEqual([]);
    expect(d.update(400, 0, out)).toBe(10);
    expect(d.skipped).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(d.holding).toBe(true);
    for (let w = 1; w <= 200; w++) if (isBossWave(w)) expect(d.skipsWave(w)).toBe(false);
    expect(d.skipsWave(1)).toBe(false);
    expect(new WaveDirector(5, WAVE_TIME, 0).skipsWave(3)).toBe(false);

    const w = worldWith({ waveSkip: 1 });
    w.god = true;
    run(w, 41);
    expect(w.wave).toBe(10);
    const skipped = w.waveEvents.filter(e => e.skipped);
    expect(skipped.map(e => e.wave)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(skipped.every(e => e.cores === 0 && e.bonus === 0)).toBe(true);
    expect(w.cores).toBe(waveStartCores(10)); // only the boss wave paid
    expect(w.boss).not.toBeNull();
  });

  it('WAVE SKIPPER: about the chosen share of normal waves is skipped, the same every time for one seed', () => {
    const d = new WaveDirector(7, WAVE_TIME, 0.1);
    let n = 0, total = 0;
    for (let wv = 2; wv <= 2000; wv++) if (!isBossWave(wv)) { total++; if (d.skipsWave(wv)) n++; }
    expect(n / total).toBeGreaterThan(0.07);
    expect(n / total).toBeLessThan(0.13);
    const e = new WaveDirector(7, WAVE_TIME, 0.1);
    for (let wv = 2; wv <= 60; wv++) expect(e.skipsWave(wv)).toBe(d.skipsWave(wv));
  });

  it('REPAIR BAY: heals 2% of the max hull a second after 2 s without a hit, waits again after a hit', () => {
    const v = worldWith({ repairRate: 0.02 }, { autoSpawn: false });
    run(v, REPAIR_IDLE_SECONDS + 0.5);
    v.hull = v.maxHull * 0.5;
    const before = v.hull;
    run(v, 1);
    expect(v.hull - before).toBeCloseTo(v.maxHull * 0.02, 1);
    v.hull = v.maxHull - 0.01;
    run(v, 3);
    expect(v.hull).toBeLessThanOrEqual(v.maxHull);

    const h = worldWith({ repairRate: 0.02 }, { autoSpawn: false });
    run(h, 3);
    h.enemyBullets.spawn(h.shipX, h.shipY, 0, 0);
    h.update(DT, idle());
    const hit = h.hull;
    expect(hit).toBeLessThan(h.maxHull);
    run(h, 1.5);
    expect(h.hull).toBe(hit);
    run(h, 1);
    expect(h.hull).toBeGreaterThan(hit);

    const z = worldWith({}, { autoSpawn: false });
    z.hull = BASE_HULL / 2;
    run(z, 5);
    expect(z.hull).toBe(BASE_HULL / 2);
  });

  it('BOSS BOUNTY: a boss pays +50% Cores and has +25% HP (the downside)', () => {
    const mk = (f: Partial<FlyTraits>) => { const w = worldWith(f, { startWave: 10 }); w.god = true; run(w, 0.5); return w; };
    const a = mk({}), b = mk({ bossCoresMul: 1.5, bossHpMul: 1.25 });
    expect(a.boss && b.boss).toBeTruthy();
    expect(b.boss!.maxHp / a.boss!.maxHp).toBeCloseTo(1.25, 2);
    const kill = (w: World) => {
      const before = w.cores;
      const bs = w.boss!;
      bs.hp = 1e-6;
      w.pool.spawn(bs.conduits[0].x, bs.conduits[0].y, 0, -1, 1e9);
      w.update(DT, idle());
      return w.cores - before;
    };
    const pa = kill(a), pb = kill(b);
    expect(pa).toBeGreaterThan(0);
    expect(pb).toBeGreaterThan(pa);
  });
});
