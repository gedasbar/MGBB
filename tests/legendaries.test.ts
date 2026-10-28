import { describe, it, expect } from 'vitest';
import { BLOCKS } from '../src/data/blocks';
import { blockText, SHORT_MAX } from '../src/data/blockText';
import { BLOCK_ECONOMY, LEGENDARY_PRICE_BY_RING, medalPriceOf } from '../src/data/blockEconomy';
import { compile, Grid } from '../src/engine/compiler';
import { Modifier } from '../src/engine/compilerTypes';
import {
  frontierEchoAdd, heavyRoundMul, hollowCoreMul, idleBarrelsAdd, lastBreathMul, loneShotMul, waypointMul, zigzagMul, MIRROR_OFFSET,
} from '../src/engine/effects';
import { ProjectilePool } from '../src/engine/pools';
import { EnemyEntity, ProjectileSystem } from '../src/engine/projectiles';
import { SpatialHash } from '../src/engine/spatialHash';
import { TRIGGERS } from '../src/engine/triggers';
import { Gun, spawnOffsetsFor } from '../src/game/fire';
import { buildFanGrid, HULL_BUILDERS } from '../src/game/gridUtils';
import { buildPathGrid, buildStarterGrid, place } from '../src/game/starter';
import { buildDartGrid } from '../src/game/gridUtils';
import { buyCopy, defaultProgress, loadProgress, ProgressStore, PROGRESS_VERSION, blockLockReason } from '../src/econ/progress';
import { copyAffordable, sheetContent } from '../src/builder/paletteLogic';
import { copyPrice } from '../src/econ/economy';
import { furthestRing, gateOf, isBlockUnlocked, UNLOCKS, unlocksOnSquare } from '../src/frontier/unlocks';
import { sqKey } from '../src/frontier/world';

// Chunk 20a: the twelve legendary blocks (docs/legendaries.md). One test per formula, with the edge cases.

const LEGENDARY = ['frontier_echo', 'payload', 'lone_shot', 'last_breath', 'zigzag', 'heavy_round', 'hollow_core', 'idle_barrels', 'waypoint', 'rebound', 'mirror', 'fuse'];

/** A Dart with one block in its only buildable cell. */
function dartWith(id: string): Grid {
  const g = buildDartGrid();
  place(g, 1, 2, id);
  return g;
}
/** The Fan's straight column under its middle ejector: Flat+ first, then `ids` in order (as scripts/interaction-audit.ts does). */
function fanLine(ids: string[]): Grid {
  const g = buildFanGrid();
  place(g, 5, 9, 'flat_plus');
  ids.forEach((id, k) => place(g, 5, 8 - k, id));
  return g;
}
const firstDamage = (g: Grid, opts = {}) => compile(g, opts).recipes[0].packet.damage;

describe('legendary blocks: data', () => {
  it('twelve blocks, category legendary, one copy, one level, shown, with a short player line of at most 60 characters', () => {
    const found = Object.values(BLOCKS).filter(b => b.category === 'legendary').map(b => b.id).sort();
    expect(found).toEqual([...LEGENDARY].sort());
    for (const id of LEGENDARY) {
      const b = BLOCKS[id];
      expect(b.shown, id).toBe(true);
      expect(b.maxLevel, id).toBe(1);
      expect(BLOCK_ECONOMY[id].cap, id).toBe(1);
      const t = blockText(b);
      expect(t.short.length, id).toBeLessThanOrEqual(SHORT_MAX);
      expect(t.stack, id).toBeNull();
    }
  });
});

describe('legendary blocks: the formulas', () => {
  it('Frontier Echo: 10% of the furthest ring, whole numbers (ring 300 = +30)', () => {
    expect([0, 9, 10, 99, 100, 199, 300].map(frontierEchoAdd)).toEqual([0, 0, 1, 9, 10, 19, 30]);
    expect(firstDamage(dartWith('frontier_echo'), { furthestRing: 300 })).toBe(1 + 30);
    expect(firstDamage(dartWith('frontier_echo'), { furthestRing: 109 })).toBe(1 + 10);
    expect(firstDamage(dartWith('frontier_echo'))).toBe(1); // no Frontier progress: +0
  });
  it('Payload: +25 flat', () => {
    expect(firstDamage(dartWith('payload'))).toBe(26);
  });
  it('Lone Shot: x2 with one shot alive, x1 from ten (and above), a straight line between', () => {
    expect(loneShotMul(1)).toBe(2);
    expect(loneShotMul(0)).toBe(2); // nothing alive counts as one
    expect(loneShotMul(10)).toBe(1);
    expect(loneShotMul(12)).toBe(1);
    expect(loneShotMul(5)).toBeCloseTo(1 + 5 / 9, 12);
    expect(loneShotMul(9)).toBeCloseTo(1 + 1 / 9, 12);
  });
  it('Last Breath: x2 only in the last second of the shot\'s life', () => {
    expect(lastBreathMul(1.99, 3)).toBe(1);
    expect(lastBreathMul(2, 3)).toBe(2);
    expect(lastBreathMul(2.9, 3)).toBe(2);
  });
  it('Zigzag: +5% per change, added (after 10 changes x1.5, not 1.05^10)', () => {
    expect(zigzagMul(0)).toBe(1);
    expect(zigzagMul(10)).toBeCloseTo(1.5, 12);
  });
  it('Heavy Round: x2 at normal speed, x5 at 0.2x, linear between, flat outside', () => {
    expect(heavyRoundMul(1)).toBe(2);
    expect(heavyRoundMul(1.3)).toBe(2); // a fast hull gets no more than x2
    expect(heavyRoundMul(0.2)).toBe(5);
    expect(heavyRoundMul(0.05)).toBe(5);
    expect(heavyRoundMul(0.6)).toBeCloseTo(3.5, 12);
    // In the compiler: the Dart (speed 1) doubles; a captain slowing shots to 0.2x gives x5; the Galleon (0.9x) is a little over x2.
    expect(firstDamage(dartWith('heavy_round'))).toBe(2);
    expect(firstDamage(dartWith('heavy_round'), { projSpeedMul: 0.2 })).toBe(5);
    const gal = buildPathGrid('galleon')!;
    const cell = compile(gal).cellInfo.findIndex((ci, i) => ci.onPath && gal.cells[i].type === 'empty' && !gal.cells[i].blockId);
    place(gal, (cell % gal.w) + 1, Math.floor(cell / gal.w) + 1, 'heavy_round');
    expect(firstDamage(gal)).toBeCloseTo(heavyRoundMul(0.9), 12);
    expect(heavyRoundMul(0.9)).toBeGreaterThan(2);
  });
  it('Hollow Core: +10% per empty buildable cell, counted at compile time', () => {
    expect(hollowCoreMul(0)).toBe(1);
    expect(hollowCoreMul(1)).toBeCloseTo(1.1, 12);
    expect(hollowCoreMul(7)).toBeCloseTo(1.7, 12);
    const g = fanLine(['hollow_core']);
    const empty = g.cells.filter(c => c.type === 'empty' && !c.blockId).length;
    expect(firstDamage(g)).toBeCloseTo((1 + 1) * (1 + 0.1 * empty), 9); // Flat+ first, then Hollow Core
    // Placing another block takes one empty cell away.
    const h = fanLine(['hollow_core', 'payload']);
    expect(firstDamage(h)).toBeCloseTo(((1 + 1) * (1 + 0.1 * (empty - 1))) + 25, 9);
  });
  it('Idle Barrels: +3 per ejector no signal reaches; 0 when every ejector is used', () => {
    expect([0, 1, 4].map(idleBarrelsAdd)).toEqual([0, 3, 12]);
    const g = fanLine(['idle_barrels']);
    const ejectors = g.cells.filter(c => c.type === 'ejector').length;
    expect(ejectors).toBeGreaterThan(1);
    expect(firstDamage(g)).toBe(2 + 3 * (ejectors - 1)); // only the middle ejector is fed
    expect(firstDamage(dartWith('idle_barrels'))).toBe(1); // the Dart's one ejector is used
  });
  it('Waypoint: x1.1 per turn block passed before it', () => {
    expect(waypointMul(0)).toBe(1);
    expect(waypointMul(2)).toBeCloseTo(1.21, 12);
    const g = buildStarterGrid(); // turn_r, turn_l, flat_plus, then the ejector
    place(g, 9, 4, 'waypoint');
    expect(firstDamage(g)).toBeCloseTo(2 * 1.1 * 1.1, 12);
    // No turn before it: x1.
    expect(firstDamage(fanLine(['waypoint']))).toBe(2);
  });
});

/** A running gun for a compiled grid, with its pool and projectile system. */
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

describe('legendary blocks: the gun', () => {
  it('Lone Shot: the damage a shot leaves with follows the number of your shots alive', () => {
    const results: Record<number, number> = {};
    for (const n of [0, 1, 5, 12]) {
      const { pool, gun } = gunFor(fanLine(['lone_shot']));
      for (let k = 0; k < n; k++) pool.spawn(10 + k, 10, 0, 0, 1, 0, 0); // shots already in the air
      gun.fire(270, 800);
      const fresh = alive(pool).filter(i => pool.y[i] > 400)[0];
      results[n] = pool.damage[fresh];
    }
    expect(results[0]).toBe(4); // Flat+ (2) x2
    expect(results[1]).toBe(4);
    expect(results[5]).toBeCloseTo(2 * loneShotMul(5), 9);
    expect(results[12]).toBe(2);
  });

  it('Rebound: the first shot gets x1; a shot that arrives stronger than the one before gets x4; an equal one does not', () => {
    // Overclock before Rebound: every shot of a streak arrives a little stronger than the one before.
    const rising = gunFor(fanLine(['overclock', 'rebound']));
    const dmg: number[] = [];
    for (let k = 0; k < 3; k++) {
      rising.pulse();
      dmg.push(Math.max(...alive(rising.pool).map(i => rising.pool.damage[i])));
      rising.pool.active.fill(0); rising.pool.count = 0;
    }
    expect(dmg[0]).toBeCloseTo(2, 9); // no earlier shot: no bonus
    expect(dmg[1]).toBeGreaterThan(7.9); // 2.04 x 4
    expect(dmg[2]).toBeGreaterThan(8.1);
    expect(rising.sys.fx.reboundBonuses).toBe(2);
    // A plain line: every shot arrives with the same damage, so nothing is "less than": never a bonus.
    const flat = gunFor(fanLine(['rebound']));
    for (let k = 0; k < 4; k++) flat.pulse();
    expect(flat.sys.fx.reboundBonuses).toBe(0);
    expect(Math.max(...alive(flat.pool).map(i => flat.pool.damage[i]))).toBe(2);
  });

  it('Fuse: 9 shots are absorbed, the 10th leaves as one shot with double the total of the 10; it never makes more than it absorbs', () => {
    const { pool, pulse } = gunFor(fanLine(['fuse']));
    for (let k = 0; k < 9; k++) pulse();
    expect(pool.count).toBe(0); // nothing left yet
    pulse();
    expect(pool.count).toBe(1);
    expect(pool.damage[alive(pool)[0]]).toBe(2 * 10 * 2); // ten Flat+ shots of 2, doubled
    for (let k = 0; k < 90; k++) pulse();
    expect(pool.count).toBe(10); // 100 pulses in, 10 shots out
  });

  it('Mirror: every shot gets exactly one clone beside it with the same damage and modifiers; a clone is never cloned; a full pool skips it', () => {
    const { pool, pulse, sys } = gunFor(fanLine(['mirror']));
    pulse();
    expect(pool.count).toBe(2);
    const [a, b] = alive(pool);
    expect(pool.damage[a]).toBe(pool.damage[b]);
    expect(pool.modIndex[a]).toBe(pool.modIndex[b]);
    expect(Math.abs(pool.x[a] - pool.x[b])).toBeCloseTo(MIRROR_OFFSET, 3);
    expect(pool.y[a]).toBeCloseTo(pool.y[b], 3);
    for (let k = 0; k < 9; k++) pulse();
    expect(pool.count).toBe(20); // 10 pulses, 20 shots: no clone of a clone
    expect(sys.fx.mirrorClones).toBe(10);
    // A pool with room for one shot: the shot flies, the clone is skipped, nothing throws.
    const tiny = gunFor(fanLine(['mirror']), 1);
    tiny.pulse();
    expect(tiny.pool.count).toBe(1);
  });

  it('Mirror counts as two shots per pulse in the stats', () => {
    const plain = compile(fanLine([])).stats;
    const mirrored = compile(fanLine(['mirror'])).stats;
    expect(mirrored.projectilesPerPulse).toBeCloseTo(plain.projectilesPerPulse * 2, 9);
    expect(mirrored.estDps).toBeCloseTo(plain.estDps * 2, 6);
  });
});

/** A projectile rig (the same shape as tests/interactions.test.ts). */
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
  const step = () => {
    const dt = 1 / 60;
    sys.steer(dt, enemies);
    for (let i = 0; i < pool.max; i++) if (pool.active[i]) { pool.x[i] += pool.vx[i] * dt; pool.y[i] += pool.vy[i] * dt; }
    hash.clear();
    for (const e of enemies) hash.insert(e.id, e.x, e.y);
    sys.processHits(enemies, hash, 1);
  };
  return { pool, sys, rock, launch, step };
}

describe('legendary blocks: shots in flight', () => {
  it('Last Breath: a hit in the last second of the shot\'s life takes x2, an earlier hit does not', () => {
    for (const [age, mul] of [[1.5, 1], [2.5, 2]] as const) {
      const r = rig();
      const i = r.launch([{ type: 'last_breath' }], 270, 500, 0, -600, 100);
      const e = r.rock(270, 480);
      r.pool.age[i] = age;
      r.step();
      expect(1e6 - e.hp, `age ${age}`).toBeCloseTo(100 * mul, 6);
    }
  });

  it('Zigzag: turns every 0.2 s (alternating sides, keeps going up) and each change adds +5% to the hit', () => {
    const r = rig();
    const i = r.launch([{ type: 'zigzag' }], 270, 900, 0, -600, 100);
    const heading: number[] = [];
    // 1.0 s = five changes. Record the sideways speed once per leg.
    for (let t = 0; t < 60; t++) {
      r.step();
      if (t % 12 === 6) heading.push(Math.sign(r.pool.vx[i]));
    }
    expect(r.pool.zigN[i]).toBeGreaterThanOrEqual(4); // 1.0 s / 0.2 s = 5 changes (the float timer may be a hair short of the fifth)
    expect(r.pool.zigN[i]).toBeLessThanOrEqual(5);
    expect(heading.slice(0, 4)).toEqual([-1, 1, -1, 1]); // left, right, left, right
    expect(r.pool.vy[i]).toBeLessThan(0); // still heading up the screen
    expect(Math.hypot(r.pool.vx[i], r.pool.vy[i])).toBeCloseTo(600, 3); // speed kept
    const e = r.rock(r.pool.x[i], r.pool.y[i]);
    r.step();
    const n = r.pool.zigN[i]; // the changes made by the time of the hit
    expect(n).toBeGreaterThanOrEqual(4);
    expect(1e6 - e.hp).toBeCloseTo(100 * (1 + 0.05 * n), 6); // additive: n x 5%, not 1.05^n
  });
});

describe('legendary blocks: the trigger table', () => {
  it('Mirror fires once at launch and is carried by nothing else', () => {
    expect(TRIGGERS.mirror.fires).toBe('launch');
    expect(TRIGGERS.mirror.maxPerShot).toBe(1);
    expect(TRIGGERS.mirror.fragments).toBe(false);
    expect(TRIGGERS.mirror.arcs).toBe(false);
  });
});

describe('legendary blocks: unlock by direction and ring', () => {
  const NONE = { N: 0, E: 0, S: 0, W: 0 };
  it('each legendary sits at ring 100 / 200 / 300 of its own direction, three per direction', () => {
    const table: Record<string, [string, number]> = {
      frontier_echo: ['N', 100], payload: ['N', 200], lone_shot: ['N', 300],
      last_breath: ['E', 100], zigzag: ['E', 200], heavy_round: ['E', 300],
      hollow_core: ['S', 100], idle_barrels: ['S', 200], waypoint: ['S', 300],
      rebound: ['W', 100], mirror: ['W', 200], fuse: ['W', 300],
    };
    for (const [id, [sec, ring]] of Object.entries(table)) {
      expect(gateOf(id), id).toMatchObject({ sector: sec, ring });
      // The price table is keyed by the same ring.
      expect(BLOCK_ECONOMY[id].base, id).toBe(LEGENDARY_PRICE_BY_RING[ring].credits);
      expect(medalPriceOf(id), id).toBe(LEGENDARY_PRICE_BY_RING[ring].medals);
    }
  });
  it('reaching a ring unlocks only that direction, only at or beyond the ring', () => {
    expect(isBlockUnlocked('fuse', 0, { ...NONE, W: 299 })).toBe(false);
    expect(isBlockUnlocked('fuse', 0, { ...NONE, W: 300 })).toBe(true);
    expect(isBlockUnlocked('fuse', 0, { N: 999, E: 999, S: 999, W: 0 })).toBe(false); // the wrong direction does not count
    expect(isBlockUnlocked('payload', 0, { ...NONE, N: 100 })).toBe(false); // ring 100 is Frontier Echo, not Payload
    expect(isBlockUnlocked('frontier_echo', 0, { ...NONE, N: 100 })).toBe(true);
    expect(isBlockUnlocked('payload', 0, { ...NONE, N: 250 })).toBe(true);
    expect(isBlockUnlocked('lone_shot', 0, { ...NONE, N: 250 })).toBe(false);
  });
  it('chunk 20b: the Frontier unlocks legendary blocks only; the ordinary ones moved to campaign tiers', () => {
    for (const u of UNLOCKS) expect(BLOCKS[u.blockId].category, u.blockId).toBe('legendary');
    for (const id of ['chain_lightning', 'fission_catalyst', 'executioner', 'alternator', 'frostbite']) expect(gateOf(id), id).toBeUndefined();
    expect(unlocksOnSquare(0, -50)).toEqual([]);
    expect(unlocksOnSquare(0, -200).map(u => u.blockId)).toEqual(['payload']);
  });
  it('the furthest ring is the highest in any direction', () => {
    expect(furthestRing(NONE)).toBe(0);
    expect(furthestRing({ N: 12, E: 240, S: 0, W: 99 })).toBe(240);
  });
  it('the run modifiers carry the furthest ring for Frontier Echo', () => {
    const store = new ProgressStore(null, defaultProgress());
    expect(store.runModifiers().furthestRing).toBe(0);
    store.data.frontier.sq[sqKey(0, -100)] = 2;
    store.data.frontier.sq[sqKey(200, 0)] = 1;
    store.commit();
    expect(store.runModifiers().furthestRing).toBe(200);
  });
});

describe('legendary blocks: two prices', () => {
  const reached = () => {
    const p = defaultProgress();
    p.frontier.sq[sqKey(0, -100)] = 2; // North ring 100
    return p;
  };
  it('the table: 15 Medals + 8K, 25 + 65K, 40 + 300K by ring', () => {
    expect(LEGENDARY_PRICE_BY_RING).toEqual({ 100: { credits: 8_000, medals: 15 }, 200: { credits: 65_000, medals: 25 }, 300: { credits: 300_000, medals: 40 } });
    expect(copyPrice('frontier_echo', 0)).toBe(8_000);
    expect(copyPrice('fuse', 0)).toBe(300_000);
  });
  it('locked until the ring is reached, then both prices must be payable; buying takes both', () => {
    const p = defaultProgress();
    p.credits = 1e9; p.medals = 100;
    expect(blockLockReason(p, 'frontier_echo')).toBe('Reach ring 100 North');
    expect(buyCopy(p, 'frontier_echo')).toEqual({ ok: false, error: 'Reach ring 100 North' });
    expect(p.credits).toBe(1e9); expect(p.medals).toBe(100); // nothing taken
    const q = reached();
    q.credits = 1e9; q.medals = 14;
    expect(buyCopy(q, 'frontier_echo')).toEqual({ ok: false, error: 'Not enough Medals' });
    expect(q.credits).toBe(1e9); expect(q.medals).toBe(14); // neither taken
    q.medals = 15; q.credits = 7_999;
    expect(buyCopy(q, 'frontier_echo')).toEqual({ ok: false, error: 'Not enough credits' });
    expect(q.medals).toBe(15);
    q.credits = 10_000;
    expect(buyCopy(q, 'frontier_echo')).toEqual({ ok: true, price: 8_000 });
    expect(q.credits).toBe(2_000); expect(q.medals).toBe(0); expect(q.owned.frontier_echo).toBe(1);
    q.credits = 1e9; q.medals = 50;
    expect(buyCopy(q, 'frontier_echo').ok).toBe(false); // cap 1
    expect(q.medals).toBe(50);
  });
  it('the info sheet shows both prices and Buy needs both; the yellow dot only when both can be paid', () => {
    const base = { id: 'frontier_echo', name: 'Frontier Echo', desc: 'x', owned: 0, available: 0, level: 1, maxLevel: 1, cap: 1, upgradePrice: 0, lock: null, copyPrice: 8_000, medalPrice: 15 };
    const buy = (credits: number, medals: number) => sheetContent({ ...base, credits, medals }).buy!;
    expect(buy(8_000, 15).label).toBe('Buy +1\n8K + 15 Medals');
    expect(buy(8_000, 15).enabled).toBe(true);
    expect(buy(8_000, 14).enabled).toBe(false);
    expect(buy(7_999, 15).enabled).toBe(false);
    const dot = (credits: number, medals: number, locked = false) =>
      copyAffordable({ credits, medals, copyPrice: 8_000, medalPrice: 15, owned: 0, cap: 1, locked });
    expect(dot(8_000, 15)).toBe(true);
    expect(dot(8_000, 14)).toBe(false);
    expect(dot(7_999, 15)).toBe(false);
    expect(dot(1e9, 99, true)).toBe(false); // locked
    // An ordinary block still has no Medal price in its label.
    expect(sheetContent({ ...base, id: 'payload', copyPrice: 600, medalPrice: undefined, credits: 1000 }).buy!.label).toBe('Buy +1\n600');
  });
});

describe('legendary blocks: saves', () => {
  it('the save version stays 9; a v9 save without legendaries loads unchanged and the new blocks start at 0 copies', () => {
    expect(PROGRESS_VERSION).toBe(9);
    const old = {
      version: 9, credits: 12345, medals: 7, owned: { chain_lightning: 1, flat_plus: 3 }, levels: { flat_plus: 4 }, ownedHulls: ['dart', 'twin'],
      frontier: { seed: 5, sq: { [sqKey(0, -120)]: 2 } },
    };
    const p = loadProgress(JSON.stringify(old));
    expect(p.credits).toBe(12345);
    expect(p.medals).toBe(7);
    expect(p.owned.chain_lightning).toBe(1); // the block that moved from ring 100 to ring 50 is kept
    expect(p.owned.flat_plus).toBe(3);
    expect(p.levels.flat_plus).toBe(4);
    for (const id of LEGENDARY) expect(p.owned[id], id).toBe(0);
    expect(p.ownedHulls).toEqual(['dart', 'twin']);
    // Ring 120 North was reached in the old save, so Frontier Echo can be bought now; Payload (ring 200) not.
    const store = new ProgressStore(null, p);
    expect(blockLockReason(p, 'frontier_echo', store.frontierReach)).toBeNull();
    expect(blockLockReason(p, 'payload', store.frontierReach)).toBe('Reach ring 200 North');
  });
  it('an owned legendary survives a save round trip', () => {
    const p = defaultProgress();
    p.owned.mirror = 1;
    const back = loadProgress(JSON.stringify(p));
    expect(back.owned.mirror).toBe(1);
  });
});

describe('legendary blocks: all hulls still compile', () => {
  it('every legendary alone on a path still gives a recipe on the Fan hull', () => {
    for (const id of LEGENDARY) {
      const c = compile(fanLine([id]));
      expect(c.recipes.length, id).toBeGreaterThan(0);
      expect(c.recipes[0].packet.damage, id).toBeGreaterThan(0);
    }
    expect(Object.keys(HULL_BUILDERS).length).toBeGreaterThan(0);
  });
});
