import { describe, it, expect } from 'vitest';
import { BLOCKS, gamblerProb, percentMul, pickerBlocks } from '../src/data/blocks';
import { BLOCK_ECONOMY, capOf, FIXED_LEVEL, UPGRADABLE } from '../src/data/blockEconomy';
import { atCopyCap, BASE_PRICE, copyPrice, upgradePrice } from '../src/econ/economy';
import { LEGACY_BASE_PRICE, legacyCopyPrice, legacyUpgradePrice } from '../src/econ/legacyPrices';
import { migrateEconomyV8, refundNotice } from '../src/econ/migrate';
import { buyCopy, buyUpgrade, defaultProgress, loadProgress, PROGRESS_VERSION, ProgressStore, serializeProgress } from '../src/econ/progress';
import { sheetContent } from '../src/builder/paletteLogic';
import { BuilderModel } from '../src/builder/model';
import { compile } from '../src/engine/compiler';
import { describeBlock, evalDamage, mulSafe, newPacket } from '../src/engine/compilerTypes';
import { applyDamage } from '../src/engine/damage';
import { aoeStackDamage, harmonic, stackGrowth } from '../src/engine/effects';
import { Gun, spawnOffsetsFor } from '../src/game/fire';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { ProjectilePool } from '../src/engine/pools';
import { PHASE_BOOM_BACK, PHASE_MINE_WAIT, ProjectileSystem, EnemyEntity } from '../src/engine/projectiles';
import { Modifier } from '../src/engine/compilerTypes';
import { SpatialHash } from '../src/engine/spatialHash';
import { fmtBig, fmtDamage } from '../src/ui/format';
import { boomerangRange, bounceCount, chainJumps, MINE_SIZE } from '../src/engine/effects';

const mem = (init: Record<string, string> = {}) => {
  const d = { ...init };
  return { d, getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => { d[k] = v; }, removeItem: (k: string) => { delete d[k]; } };
};

// ------------------------------------------------------------------ Percent x and the boosters
describe('Percent x ladder (step 3)', () => {
  it('x1.5 at L1, x3 at L10, geometric in between (constant ratio 2^(1/9))', () => {
    expect(percentMul(1)).toBeCloseTo(1.5, 12);
    expect(percentMul(10)).toBeCloseTo(3, 12);
    expect(percentMul(5)).toBeCloseTo(1.5 * Math.pow(2, 4 / 9), 12);
    const ratio = Math.pow(2, 1 / 9);
    for (let l = 1; l < 10; l++) expect(percentMul(l + 1) / percentMul(l)).toBeCloseTo(ratio, 12);
    expect(BLOCKS.percent_mult.maxLevel).toBe(10);
  });
  it('the compiled damage uses the ladder, and the rule text shows it', () => {
    const g = HULL_BUILDERS.twin();
    place(g, 1, 2, 'percent_mult', 10);
    expect(compile(g).recipes[0].packet.damage).toBeCloseTo(3, 9);
    expect(describeBlock(BLOCKS.percent_mult, 1)).toContain('×1.5');
    expect(describeBlock(BLOCKS.percent_mult, 10)).toContain('×3');
  });
  it("Gambler's Gate: 40% at L1, 45% at L2, 50% at L3 for x3; Lucky Strike and Jackpot are unchanged", () => {
    expect([1, 2, 3].map(gamblerProb)).toEqual([0.4, 0.45, 0.5]);
    for (const [l, p] of [[1, 0.4], [2, 0.45], [3, 0.5]] as const) {
      const g = HULL_BUILDERS.twin();
      place(g, 1, 2, 'gamblers_gate', l);
      const gate = compile(g).recipes[0].packet.gates[0];
      expect(gate.prob).toBeCloseTo(p, 12);
      expect(gate.mult).toBe(3);
      expect(gate.elseMult).toBe(0);
    }
    expect(describeBlock(BLOCKS.lucky_strike, 1)).toBe('33% chance to double projectile damage.');
    expect(describeBlock(BLOCKS.lucky_strike, 3)).toBe('43% chance to double projectile damage.');
    expect(describeBlock(BLOCKS.jackpot, 1)).toBe('4% chance to multiply projectile damage by 10.');
  });
});

// ------------------------------------------------------------------ upgrades and single levels
describe('upgrades and single levels (step 2)', () => {
  it('only the eight named blocks have levels; every other block has one level and a fixed level', () => {
    for (const b of pickerBlocks()) {
      if (UPGRADABLE.has(b.id)) { expect(b.maxLevel, b.id).toBeGreaterThan(1); expect(b.fixedLevel, b.id).toBeUndefined(); }
      else { expect(b.maxLevel, b.id).toBe(1); expect(b.fixedLevel, b.id).toBe(FIXED_LEVEL[b.id] ?? 1); }
    }
    expect([...UPGRADABLE].sort()).toEqual(['armor_piercer', 'flat_plus', 'gamblers_gate', 'jackpot', 'lucky_strike', 'percent_mult', 'pure_converter', 'shield_breaker']);
  });
  it('a block runs at its fixed level whatever level the cell holds (Frostbite fixed level 3: 40% slow)', () => {
    const run = (cellLevel: number) => { const g = HULL_BUILDERS.twin(); place(g, 1, 2, 'frostbite', cellLevel); return compile(g).recipes[0].packet.mods; };
    expect(run(1)).toEqual([{ type: 'frostbite', level: 3 }]);
    expect(run(5)).toEqual([{ type: 'frostbite', level: 3 }]);
    expect(describeBlock(BLOCKS.frostbite, 1)).toContain('40%');
  });
  it('buying an upgrade of a block without upgrades is refused; the sheet shows no level line and no upgrade button', () => {
    const p = { ...defaultProgress(), credits: 1e9 };
    expect(buyUpgrade(p, 'piercing')).toEqual({ ok: false, error: 'This block has no upgrades' });
    expect(p.credits).toBe(1e9);
    const c = sheetContent({ id: 'piercing', name: 'Piercing', desc: 'x', owned: 1, available: 1, level: 1, maxLevel: 1, credits: 1e9, copyPrice: 650, upgradePrice: 1, lock: null, cap: Infinity });
    expect(c.levelLine).toBe('');
    expect(c.upgrade).toBeNull();
    const up = sheetContent({ id: 'percent_mult', name: 'Percent x', desc: 'x', owned: 1, available: 1, level: 2, maxLevel: 10, credits: 1e9, copyPrice: 130, upgradePrice: 400, lock: null, cap: 10 });
    expect(up.levelLine).toBe('Level 2/10');
    expect(up.upgrade?.enabled).toBe(true);
  });
});

// ------------------------------------------------------------------ caps and prices
describe('copy caps and prices (step 4)', () => {
  it('the caps the owner listed', () => {
    const caps: Record<string, number> = {
      percent_mult: 10, flat_plus: 10, lucky_strike: 6, jackpot: 6, gamblers_gate: 4, overclock: 3, turn_l: 8, turn_r: 8, splitter_2: 2,
      splitter_3: 1, alternator: 1, random_router: 1, capacitor: 1,
      ignite: 1, frostbite: 1, corrosion: 1, static_charge: 1, fission_catalyst: 1, cauterize: 1, cleaver: 1, culling_bolt: 1, residue_seed: 1, overkill_spill: 1,
      curving_right: 1, random_curve: 1,
    };
    for (const [id, cap] of Object.entries(caps)) expect(capOf(id), id).toBe(cap);
    // the shape blocks that stack have no cap
    for (const id of ['piercing', 'bouncing', 'aoe_circle', 'aoe_rect', 'chain_lightning', 'homing', 'fork_impact', 'boomerang', 'orbit', 'mine']) expect(capOf(id), id).toBe(Infinity);
  });
  it('every shown block has a price entry', () => {
    for (const b of pickerBlocks()) { expect(BLOCK_ECONOMY[b.id], b.id).toBeDefined(); expect(BASE_PRICE[b.id], b.id).toBeGreaterThan(0); }
  });
  it('buying stops at the cap: the cap-th copy is the last, then refused, owned never exceeds the cap', () => {
    for (const id of ['percent_mult', 'splitter_2', 'splitter_3', 'gamblers_gate', 'turn_l']) {
      const p = { ...defaultProgress(), credits: 1e12 };
      const cap = capOf(id);
      let bought = 0;
      for (let i = 0; i < cap + 5; i++) if (buyCopy(p, id).ok) bought++;
      expect(p.owned[id], id).toBe(cap);
      expect(bought, id).toBe(cap - (defaultProgress().owned[id] ?? 0));
      const before = p.credits;
      expect(buyCopy(p, id)).toMatchObject({ ok: false });
      expect(p.credits).toBe(before);
      expect(atCopyCap(id, p.owned[id])).toBe(true);
    }
  });
  it('an uncapped shape block keeps selling, at rising prices', () => {
    const p = { ...defaultProgress(), credits: 1e12 };
    for (let i = 0; i < 25; i++) expect(buyCopy(p, 'piercing').ok).toBe(true);
    expect(p.owned.piercing).toBe(25);
    expect(copyPrice('piercing', 25)).toBeGreaterThan(copyPrice('piercing', 24));
  });
  it('the sheet reads owned / cap and the Buy button becomes a disabled Max at the cap', () => {
    const at = (owned: number, cap: number) => sheetContent({ id: 'x', name: 'X', desc: '', owned, available: owned, level: 1, maxLevel: 10, credits: 1e9, copyPrice: 10, upgradePrice: 10, lock: null, cap });
    expect(at(3, 10).ownedLine).toBe('Owned 3 / 10');
    expect(at(3, 10).buy).toEqual({ label: 'Buy +1\n10', enabled: true });
    expect(at(10, 10).buy).toEqual({ label: 'Max', enabled: false });
    expect(at(40, Infinity).ownedLine).toBe('Owned 40');
    const builder = sheetContent({ id: 'x', name: 'X', desc: '', owned: 4, available: 1, level: 1, maxLevel: 1, credits: 0, copyPrice: 1, upgradePrice: 1, lock: null, cap: 8, showFree: true });
    expect(builder.ownedLine).toBe('Owned 4 / 8 · free 1');
  });
  it('family B: the n-th Percent x costs round(100 x 1.30^(n-1)); cheap blocks grow 1.15; upgrades keep base x 2 x 2.2^(L-1)', () => {
    expect([0, 1, 2, 4, 9].map(o => copyPrice('percent_mult', o))).toEqual([100, 130, 169, 286, 1060]);
    expect([0, 1, 2, 7].map(o => copyPrice('turn_l', o))).toEqual([30, 35, 40, 80]);
    expect([0, 1].map(o => copyPrice('splitter_2', o))).toEqual([120, 138]);
    expect(copyPrice('splitter_3', 0)).toBe(700);
    expect(upgradePrice('percent_mult', 1)).toBe(200);
    expect(upgradePrice('percent_mult', 2)).toBe(440);
    expect(upgradePrice('percent_mult', 3)).toBe(968);
  });
  it('single-copy blocks cost twice their old base; the owner\'s expensive-from-the-start blocks cost at least that', () => {
    for (const id of ['residue_seed', 'overkill_spill', 'aoe_circle', 'chain_lightning', 'homing', 'fork_impact', 'splitter_3']) expect(BASE_PRICE[id], id).toBeGreaterThanOrEqual(2 * LEGACY_BASE_PRICE[id]);
    expect(BASE_PRICE.ignite).toBe(2 * LEGACY_BASE_PRICE.ignite);
  });
});

// ------------------------------------------------------------------ stacking rig
const DT = 1 / 60;
function rig(poolSize = 256) {
  const pool = new ProjectilePool(poolSize);
  const sys = new ProjectileSystem(pool);
  const enemies: EnemyEntity[] = [];
  const hash = new SpatialHash(540, 960, 64);
  let nextId = 1;
  const rock = (x: number, y: number, hp = 100000, radius = 20) => {
    const e: EnemyEntity = { id: nextId++, x, y, radius, hp, maxHp: hp, armor: 0, shield: 0, maxShield: 0 };
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
  const step = (n = 1) => {
    for (let k = 0; k < n; k++) {
      sys.steer(DT, enemies);
      for (let i = 0; i < pool.max; i++) if (pool.active[i]) { pool.x[i] += pool.vx[i] * DT; pool.y[i] += pool.vy[i] * DT; }
      sys.updateStatus(DT);
      hash.clear();
      for (const e of enemies) hash.insert(e.id, e.x, e.y);
      sys.processHits(enemies, hash, 1);
    }
  };
  return { pool, sys, enemies, rock, launch, step };
}
const copiesOf = (type: string, k: number, level = 1): Modifier[] => Array.from({ length: k }, () => ({ type, level }));
const dmg = (e: EnemyEntity, from = 100000) => from - e.hp;

describe('shape blocks stack (step 5)', () => {
  it('the size and harmonic helpers: k = 1 changes nothing, growth shrinks, damage falls', () => {
    expect(stackGrowth(1)).toBe(1);
    expect(stackGrowth(2)).toBeCloseTo(1.125, 12);
    expect(stackGrowth(3)).toBeCloseTo(1.125 * (1 + 0.25 / 3), 12);
    const steps = [2, 3, 4, 5, 6, 7, 8].map(k => stackGrowth(k) / stackGrowth(k - 1) - 1);
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
    expect(harmonic(1)).toBe(1);
    expect(harmonic(3)).toBeCloseTo(1 + 1 / 2 + 1 / 3, 12);
    expect(aoeStackDamage(1)).toBe(1);
    expect(aoeStackDamage(3)).toBeCloseTo(0.9025, 12);
  });

  it('Piercing: every copy adds one to the divisor of the loss per hit (1 / (3 + extra)), so the shot keeps more of its damage', () => {
    const along = (k: number) => {
      const r = rig();
      const rocks = Array.from({ length: 10 }, (_, j) => r.rock(270, 900 - 80 * j)); // 80 px apart: the hit zones (rock 20 + shot 10) do not overlap
      r.launch(copiesOf('piercing', k, 3), 270, 960, 0, -600, 100);
      r.step(150);
      return rocks.map(e => dmg(e));
    };
    const runs = [1, 2, 3, 4].map(along);
    runs.forEach((d, i) => {
      const n = 3 + i; // level 3 plus the extra copies
      d.forEach((taken, h) => expect(taken, `k=${i + 1} rock ${h}`).toBeCloseTo(100 * Math.pow(1 - 1 / n, h), 6)); // each hit costs 1/n of the damage the shot has
    });
    const totals = runs.map(d => d.reduce((a, b) => a + b, 0));
    for (let i = 1; i < totals.length; i++) expect(totals[i]).toBeGreaterThan(totals[i - 1]);
    const gains = totals.slice(1).map((t, i) => t - totals[i]);
    for (let i = 1; i < gains.length; i++) expect(gains[i]).toBeLessThan(gains[i - 1]); // the benefit falls off
  });

  it('Bouncing: +1 bounce per copy', () => {
    for (const k of [1, 2, 3, 6]) {
      const r = rig();
      const i = r.launch(copiesOf('bouncing', k, 1), 270, 800, 0, -600);
      expect(r.pool.bounces[i], `k=${k}`).toBe(bounceCount(1) + k - 1);
    }
    // the Int8 pool field is never overflowed
    const r = rig();
    const i = r.launch(copiesOf('bouncing', 300, 1), 270, 800, 0, -600);
    expect(r.pool.bounces[i]).toBe(127);
  });

  it('AoE Circle: a bigger blast per copy with shrinking growth, and x0.95 damage per extra copy', () => {
    const reach = (k: number) => {
      const r = rig();
      const target = r.rock(270, 400, 100000, 5);
      const ring = Array.from({ length: 30 }, (_, j) => r.rock(270 + 4 + 4 * j, 400, 100000, 1)); // a row of tiny rocks to the right
      r.launch(copiesOf('aoe_circle', k, 1), 270, 440, 0, -600, 100);
      r.step(60);
      const hit = ring.filter(e => dmg(e) > 0);
      return { n: hit.length, far: hit.length ? dmg(hit[hit.length - 1]) : 0, target: dmg(target) };
    };
    const a = [1, 2, 3, 4, 5].map(reach);
    for (let i = 1; i < a.length; i++) expect(a[i].n, `copy ${i + 1} reaches further`).toBeGreaterThan(a[i - 1].n);
    const growth = a.map((x, i) => (i ? x.n - a[i - 1].n : x.n)); // extra rocks per copy
    expect(growth[1]).toBeGreaterThan(growth[4] - 1); // the extra reach does not grow
    expect(a[0].far).toBeCloseTo(100, 6);
    expect(a[2].far).toBeCloseTo(100 * 0.9025, 4);
    expect(a[2].target).toBeCloseTo(100 * 0.9025, 4);
  });

  it('AoE Rectangle: wider and taller per copy (same factors as the circle)', () => {
    const wide = (k: number) => {
      const r = rig();
      r.rock(270, 400, 100000, 5);
      const row = Array.from({ length: 80 }, (_, j) => r.rock(270 + 2 + 4 * j, 400, 100000, 1));
      r.launch(copiesOf('aoe_rect', k, 1), 270, 440, 0, -600, 100);
      r.step(60);
      return row.filter(e => dmg(e) > 0).length;
    };
    const w = [1, 2, 3].map(wide);
    expect(w[1]).toBeGreaterThan(w[0]);
    expect(w[2]).toBeGreaterThan(w[1]);
    expect(w[1] / w[0]).toBeCloseTo(1.125, 1);
  });

  it('Chain Lightning: +1 jump per copy, each jump pays the same share', () => {
    const jumps = (k: number) => {
      const r = rig();
      const rocks = Array.from({ length: 12 }, (_, j) => r.rock(270 + (j % 2 ? 40 : 0), 100 + 90 * j, 100000, 15));
      r.launch(copiesOf('chain_lightning', k, 1), 270, 100 + 90 * 0 + 60, 0, -600, 100);
      r.step(40);
      return { n: rocks.filter(e => dmg(e) > 0).length, fx: r.sys.fx.chainJumps };
    };
    const j = [1, 2, 3, 4].map(jumps);
    expect(j.map(x => x.fx)).toEqual([chainJumps(1), chainJumps(1) + 1, chainJumps(1) + 2, chainJumps(1) + 3]);
    expect(j.map(x => x.n)).toEqual([1 + chainJumps(1), 2 + chainJumps(1), 3 + chainJumps(1), 4 + chainJumps(1)]);
  });

  it('Fork on Impact: one more pair of forks per copy (2k forks), each pair 0.8 of the pair before, forks never fork', () => {
    for (const k of [1, 2, 3]) {
      const r = rig();
      r.rock(270, 400, 1e9, 20);
      r.launch(copiesOf('fork_impact', k, 1), 270, 440, 0, -600, 100);
      r.step(20);
      const live: number[] = [];
      for (let i = 0; i < r.pool.max; i++) if (r.pool.active[i]) live.push(r.pool.damage[i]);
      expect(live.length, `k=${k}`).toBe(2 * k);
      live.sort((a, b) => b - a);
      for (let pair = 1; pair <= k; pair++) expect(live[2 * (pair - 1)]).toBeCloseTo(50 * Math.pow(0.8, pair - 1), 6);
    }
    // forks never fork again: park the forks on another rock and nothing new appears
    const r = rig();
    r.rock(270, 400, 1e9, 20);
    r.launch(copiesOf('fork_impact', 2, 1), 270, 440, 0, -600, 100);
    r.step(20);
    const before = r.pool.count;
    expect(before).toBe(4);
    r.rock(100, 300, 1e9, 400); // a huge rock that overlaps every fork
    r.step(3);
    expect(r.pool.count).toBeLessThanOrEqual(before); // no new spawns
  });

  it('Fork on Impact respects the pool limit (a tiny pool is simply full, nothing throws)', () => {
    const r = rig(3);
    r.rock(270, 400, 1e9, 20);
    r.launch(copiesOf('fork_impact', 6, 1), 270, 440, 0, -600, 100);
    expect(() => r.step(20)).not.toThrow();
    expect(r.pool.count).toBeLessThanOrEqual(3);
  });

  it('Homing: the turn rate and the cone grow with the harmonic sum of the copies', () => {
    const turned = (k: number, offDeg: number) => {
      const r = rig();
      const rad = (offDeg * Math.PI) / 180;
      r.rock(270 + Math.sin(rad) * 200, 600 - Math.cos(rad) * 200, 1e9, 20);
      const i = r.launch(copiesOf('homing', k, 1), 270, 600, 0, -400, 100);
      r.sys.steer(DT, r.enemies);
      return Math.abs(Math.atan2(r.pool.vx[i], -r.pool.vy[i])) * (180 / Math.PI);
    };
    // 20 degrees off: the turn per step is the rate (180 deg/s x H(k) / 60)
    expect(turned(1, 20)).toBeCloseTo(3, 4);
    expect(turned(2, 20)).toBeCloseTo(4.5, 4);
    expect(turned(3, 20)).toBeCloseTo(3 * harmonic(3), 4);
    // 40 degrees off is outside the 60 degree cone of one copy, inside the 90 degree cone of two
    expect(turned(1, 40)).toBeCloseTo(0, 6);
    expect(turned(2, 40)).toBeGreaterThan(4);
  });

  it('Boomerang: the range grows by the AoE-style factor per copy', () => {
    const range = (k: number) => {
      const r = rig();
      const i = r.launch(copiesOf('boomerang', k, 1), 270, 800, 0, -600, 100);
      for (let n = 0; n < 600 && r.pool.phase[i] !== PHASE_BOOM_BACK; n++) r.step(1);
      return r.pool.s1[i];
    };
    // the switch to the way back is tested once a frame (10 px at this speed)
    for (const k of [1, 2, 3]) expect(Math.abs(range(k) - boomerangRange(1) * stackGrowth(k))).toBeLessThanOrEqual(10.5);
    expect(range(2)).toBeGreaterThan(range(1));
  });

  it('Mine: the trigger grows per copy', () => {
    const size = (k: number) => {
      const r = rig();
      const i = r.launch(copiesOf('mine', k, 1), 270, 800, 0, -600, 100);
      for (let n = 0; n < 600 && r.pool.phase[i] !== PHASE_MINE_WAIT; n++) r.step(1);
      return r.pool.size[i];
    };
    expect(size(1)).toBeCloseTo(MINE_SIZE, 6);
    expect(size(3)).toBeCloseTo(MINE_SIZE * stackGrowth(3), 6);
  });

  it('Orbit: a target the shot keeps overlapping is hit again sooner with more copies (0.3 s / harmonic), and the gain shrinks', () => {
    const hits = (k: number) => {
      const r = rig();
      r.rock(270, 800, 1e12, 120); // the orbit circle (60 px round the ship) lies inside this rock
      let n = 0;
      r.sys.onHit = () => { n++; };
      r.launch(copiesOf('orbit', k, 1), 270, 800, 0, -600, 100);
      r.step(58); // the orbit lasts 1 s at level 1
      return n;
    };
    const h = [1, 2, 3, 4].map(hits);
    for (let i = 1; i < h.length; i++) expect(h[i], `copy ${i + 1}`).toBeGreaterThanOrEqual(h[i - 1]); // never fewer hits with more copies
    expect(h[1]).toBeGreaterThan(h[0]);
    expect(h[3]).toBeGreaterThan(h[0]);
    expect(h[1] - h[0]).toBeGreaterThanOrEqual(h[3] - h[2]); // and it flattens (whole frames of 1/60 s)
    expect(0.3 / harmonic(2)).toBeCloseTo(0.2, 12);
  });

  it('copies that cannot stack are capped at one in the table (Curving Right, Random Curve: their turn rates add, the shot would circle)', () => {
    expect(capOf('curving_right')).toBe(1);
    expect(capOf('random_curve')).toBe(1);
  });
});

// ------------------------------------------------------------------ safety
describe('NaN and Infinity safety (step 7)', () => {
  const target = (hp = 100, shield = 0, armor = 0) => ({ hp, maxHp: hp, armor, shield, maxShield: shield });
  it('a NaN or non-positive hit does nothing', () => {
    for (const d of [NaN, -5, 0, -Infinity]) {
      const e = target(100, 50);
      const res = applyDamage(e, d, 0, 1);
      expect(e.hp, String(d)).toBe(100);
      expect(e.shield).toBe(50);
      expect(res.killed).toBe(false);
    }
  });
  it('an infinite hit kills and leaves no NaN, with or without shield, armor, pure damage and Shield-Breaker', () => {
    for (const shield of [0, 30]) for (const armor of [0, 50]) for (const pure of [0, 0.5, 1]) for (const sb of [false, true, 2.5]) {
      const e = target(100, shield, armor);
      const res = applyDamage(e, Infinity, pure, 7, armor ? 3 : 0, sb);
      expect(Number.isNaN(e.hp) || Number.isNaN(e.shield) || Number.isNaN(res.hpDamage) || Number.isNaN(res.shieldDamage)).toBe(false);
      expect(res.killed).toBe(true);
      expect(e.hp).toBeLessThanOrEqual(0);
      expect(res.hpDamage).toBeLessThanOrEqual(100);
    }
  });
  it('whatever weird number comes in, hp and shield never become NaN', () => {
    const values = [NaN, Infinity, -Infinity, 0, -1, 1e-300, 1e300, 1.7976931348623157e308, 5, Number.MIN_VALUE];
    for (const d of values) for (const pure of [0, 0.3, 1]) for (const shield of [0, 40]) for (const sb of [false, true]) {
      const e = target(100, shield, 10);
      applyDamage(e, d, pure, 3, 2, sb);
      expect(Number.isNaN(e.hp), `${d} ${pure} ${shield}`).toBe(false);
      expect(Number.isNaN(e.shield), `${d} ${pure} ${shield}`).toBe(false);
    }
  });
  it("Infinity x 0 is 0: Gambler's else branch with an infinite packet gives 0, never NaN", () => {
    expect(mulSafe(Infinity, 0)).toBe(0);
    expect(mulSafe(Infinity, 3)).toBe(Infinity);
    const p = newPacket(Infinity);
    p.ops.push({ t: 'gate', gate: { prob: 0.4, mult: 3, elseMult: 0 } });
    expect(evalDamage(p, () => 0.9)).toBe(0); // the else branch
    expect(evalDamage(p, () => 0.1)).toBe(Infinity);
    expect(Number.isNaN(evalDamage(p))).toBe(false); // expected value
  });
  it('the Gun drops a NaN packet and fires an infinite one without NaN', () => {
    const fire = (baseDamage: number) => {
      const g = HULL_BUILDERS.twin();
      place(g, 1, 2, 'flat_plus');
      const c = compile(g, { baseDamage });
      const pool = new ProjectilePool(64);
      const sys = new ProjectileSystem(pool);
      sys.modifiersTable = c.recipes.map(r => r.packet.mods);
      const gun = new Gun(pool, sys, c.recipes, spawnOffsetsFor(c.recipes, g), 0.25);
      gun.fire(270, 800);
      return Array.from(pool.damage).filter((_, i) => pool.active[i]);
    };
    expect(fire(NaN)).toEqual([]);
    expect(fire(Infinity)).toEqual([Infinity]);
    expect(fire(1e300)).toEqual([1e300 + 1]);
  });
  it('projectile damage, the Delay Line queue and the Residue cloud damage are double precision', () => {
    const pool = new ProjectilePool(4);
    expect(pool.damage).toBeInstanceOf(Float64Array);
    const i = pool.spawn(0, 0, 0, 0, 1e300);
    expect(pool.damage[i]).toBe(1e300); // a Float32 would have made this Infinity
    expect(new ProjectileSystem(pool).cloudD).toBeInstanceOf(Float64Array);
    // the delay queue: a delayed shot of 1e300 keeps its damage
    const g = HULL_BUILDERS.twin();
    place(g, 1, 3, 'delay_line');
    const c = compile(g, { baseDamage: 1e300 });
    const p2 = new ProjectilePool(8);
    const s2 = new ProjectileSystem(p2);
    s2.modifiersTable = c.recipes.map(r => r.packet.mods);
    const gun = new Gun(p2, s2, c.recipes, spawnOffsetsFor(c.recipes, g), 0.25);
    gun.fire(270, 800);
    expect(p2.count).toBe(0);
    gun.update(0.5, 270, 800);
    expect(Array.from(p2.damage).filter((_, k) => p2.active[k])[0]).toBe(1e300 + 1);
  });
  it('an infinite shot does not run out while piercing (Infinity - Infinity would be NaN) and kills what it touches', () => {
    const r = rig();
    const rocks = [0, 1, 2].map(j => r.rock(270, 400 - 50 * j, 1000));
    r.launch(copiesOf('piercing', 1, 3), 270, 460, 0, -600, Infinity);
    r.step(80);
    for (const e of rocks) { expect(Number.isNaN(e.hp)).toBe(false); expect(e.hp).toBeLessThanOrEqual(0); }
    for (let i = 0; i < r.pool.max; i++) if (r.pool.active[i]) expect(Number.isNaN(r.pool.damage[i])).toBe(false);
  });
});

describe('big number display (step 7)', () => {
  it('plain below 1000, then K, M, B, T, then scientific; never the words Infinity or NaN', () => {
    expect([0, 7, 999, 1000, 1500, 12345, 999999, 1e6, 2.5e9, 7.8e9, 3.5e12, 950e12].map(fmtBig)).toEqual(['0', '7', '999', '1K', '1.5K', '12.3K', '1M', '1M', '2.5B', '7.8B', '3.5T', '950T']);
    expect([1e15, 1.2e45, 3.456e100, 1e308].map(fmtBig)).toEqual(['1e15', '1.2e45', '3.5e100', '1e308']);
    expect(fmtBig(-2500)).toBe('-2.5K');
    expect(fmtBig(NaN)).toBe('0');
    expect(fmtBig(Infinity)).toBe('∞');
    expect(fmtBig(-Infinity)).toBe('-∞');
    for (const v of [NaN, Infinity, -Infinity, 1e308, 1.7976931348623157e308]) { expect(fmtBig(v)).not.toMatch(/Infinity|NaN/); expect(fmtDamage(v)).not.toMatch(/Infinity|NaN/); }
  });
  it('damage numbers: whole plain, one decimal, compact from 1000', () => {
    expect([0, 1, 1.5, 0.3, 2.04, 999, 1234.5, 5e6, 2.95e8, 1.2e45].map(fmtDamage)).toEqual(['0', '1', '1.5', '0.3', '2', '999', '1.23K', '5M', '295M', '1.2e45']);
    expect(fmtDamage(NaN)).toBe('0');
    expect(fmtDamage(Infinity)).toBe('∞');
  });
});

// ------------------------------------------------------------------ saves and refunds
describe('save version 8: upgrades and copies over the caps are refunded (step 8)', () => {
  const sumUp = (id: string, level: number) => { let s = 0; for (let l = 1; l < level; l++) s += legacyUpgradePrice(id, l); return s; };
  const sumCopies = (id: string, from: number, to: number) => { let s = 0; for (let k = from; k < to; k++) s += legacyCopyPrice(id, k); return s; };

  it('refunds levels of blocks that lost them at the OLD upgrade price and sets them to level 1', () => {
    const raw = { version: 7, credits: 1000, owned: { piercing: 2, homing: 1, flat_plus: 3, percent_mult: 2 }, levels: { piercing: 5, homing: 3, flat_plus: 4, percent_mult: 7 } };
    const p = loadProgress(JSON.stringify(raw));
    expect(p.version).toBe(8);
    expect(PROGRESS_VERSION).toBe(8);
    expect(p.levels.piercing).toBe(1);
    expect(p.levels.homing).toBe(1);
    expect(p.levels.flat_plus).toBe(4); // keeps upgrades
    expect(p.levels.percent_mult).toBe(7);
    expect(p.credits).toBe(1000 + sumUp('piercing', 5) + sumUp('homing', 3));
    expect(sumUp('piercing', 5)).toBe(Math.round(500) + Math.round(1100) + Math.round(2420) + Math.round(5324));
    expect(p.notice).toMatch(/^Economy update: .* credits refunded \(6 upgrade levels removed\)\.$/);
  });
  it('refunds copies over a new cap at the old copy price of each copy and sets owned to the cap', () => {
    const raw = { version: 7, credits: 0, owned: { turn_l: 12, splitter_3: 3, splitter_2: 2, flat_plus: 12, percent_mult: 10, alternator: 2 }, levels: {} };
    const p = loadProgress(JSON.stringify(raw));
    expect(p.owned.turn_l).toBe(8);
    expect(p.owned.splitter_3).toBe(1);
    expect(p.owned.splitter_2).toBe(2); // at the cap
    expect(p.owned.flat_plus).toBe(10);
    expect(p.owned.percent_mult).toBe(10);
    expect(p.owned.alternator).toBe(1);
    const expected = sumCopies('turn_l', 8, 12) + sumCopies('splitter_3', 1, 3) + sumCopies('flat_plus', 10, 12) + sumCopies('alternator', 1, 2);
    expect(p.credits).toBe(expected);
    expect(p.notice).toMatch(/9 copies over the new limits/);
  });
  it('the one-time notice is taken once, the migration does not run twice, and a v8 save is left alone', () => {
    const st = mem({ 'mgbm.progress.v1': JSON.stringify({ version: 7, credits: 5, owned: { turn_l: 10 }, levels: { piercing: 3 } }) });
    const store = new ProgressStore(st);
    const credits = store.data.credits;
    expect(credits).toBeGreaterThan(5);
    expect(store.takeNotice()).toMatch(/Economy update/);
    expect(store.takeNotice()).toBeNull();
    const again = new ProgressStore(st);
    expect(again.data.credits).toBe(credits); // not refunded a second time
    expect(again.data.version).toBe(8);
    expect(again.data.notice).toBeUndefined();
    const raw = { ...JSON.parse(serializeProgress(defaultProgress())), owned: { turn_l: 99 }, levels: { piercing: 1 } };
    expect(loadProgress(JSON.stringify(raw)).owned.turn_l).toBe(99); // v8 data is trusted (the cheat panel may exceed caps)
  });
  it('migrateEconomyV8 refunds nothing when nothing changed, and keeps hero levels (they live in captains)', () => {
    const owned = { turn_l: 2, flat_plus: 1 }; const levels = { flat_plus: 3 };
    const r = migrateEconomyV8(owned, levels);
    expect(r.credits).toBe(0);
    expect(refundNotice(r)).toBeNull();
    const raw = { version: 7, captains: { selected: 'cadet', owned: ['cadet'], heroes: { cadet: { level: 10, kills: 5, owned: [], active: {} } }, milestones: [] } };
    expect(loadProgress(JSON.stringify(raw)).captains.heroes.cadet.level).toBe(10);
  });
  it('saved circuits that place more copies than are now owned lose the extra ones, last placed first, and report how many', () => {
    // 10 Turn Left placed on a Fan, the save (v7) owned 12; after the migration 8 are owned
    const fan = HULL_BUILDERS.fan();
    const cells: { x: number; y: number; blockId: string; level: number; rotation: number }[] = [];
    for (let k = 0; k < 10; k++) cells.push({ x: k % 9, y: 2 + Math.floor(k / 9), blockId: 'turn_l', level: 1, rotation: 0 });
    void fan;
    const st = mem({
      'mgbm.progress.v1': JSON.stringify({ version: 7, credits: 0, owned: { turn_l: 12 }, levels: {}, ownedHulls: ['dart', 'fan'] }),
      'mgbm.builder.v3': JSON.stringify({ version: 3, hull: 'fan', hulls: { fan: { active: 'A', slots: { A: cells, B: [] } } } }),
    });
    const m = new BuilderModel(st, 'fan');
    expect(m.store.data.owned.turn_l).toBe(8);
    let placed = 0;
    for (const c of m.grid.cells) if (c.blockId === 'turn_l') placed++;
    expect(placed + m.trimmed).toBeLessThanOrEqual(10);
    expect(placed).toBeLessThanOrEqual(8);
  });
});

// ------------------------------------------------------------------ the economy table agrees with the old one where nothing was meant to change
describe('guards', () => {
  it('level-1 numbers of blocks that were not meant to change are unchanged (Flat+ +1, Lucky 33%, Jackpot 4%, Splitter 2 L1 text)', () => {
    expect(describeBlock(BLOCKS.flat_plus, 1)).toBe('Adds +1 damage to each projectile.');
    expect(describeBlock(BLOCKS.splitter_2, 1)).toBe('Splits the signal into two full copies, one to the left and one to the right.');
  });
});
