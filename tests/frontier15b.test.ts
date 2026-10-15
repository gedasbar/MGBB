import { describe, expect, it } from 'vitest';
import { FRONTIER_SEED, FREEFLY_SHARE, FREEFLY_SQUARE_SECONDS, FF_WAVE_CAP, PROGRESS_COLOR } from '../src/frontier/constants';
import { squareKind, squareLevel } from '../src/frontier/level';
import { encounterOutcome, planEncounter, waveEquivalent } from '../src/frontier/encounter';
import { FrontierWorld, ring, sector, sqKey } from '../src/frontier/world';
import { defaultFrontier, squareState } from '../src/frontier/state';
import { tileLook, AVAIL_PLATE, LOCKED_PLATE } from '../src/frontier/look';
import {
  FREE_NEW_BLOCKS, gateOf, isBlockUnlocked, newlyReached, reachBySector, UNLOCK_RINGS, UNLOCKS, unlockOnSquare,
} from '../src/frontier/unlocks';
import { BLOCKS } from '../src/data/blocks';
import { planWave } from '../src/game/waves';
import { World } from '../src/game/world';
import { rng } from '../src/rng';
import { SPECIES } from '../src/data/species';
import { ENEMIES } from '../src/data/enemies';
import { blockLockReason, buyCopy, buyUpgrade, defaultProgress, loadProgress, ProgressStore, PROGRESS_VERSION, serializeProgress } from '../src/econ/progress';

const SEED = FRONTIER_SEED;
const W = new FrontierWorld(SEED);
const fnv = (s: string) => {
  let h = 0x811c9dc5;
  let g = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h = Math.imul(h ^ c, 0x01000193) >>> 0; g = Math.imul(g ^ c, 0x5bd1e995) >>> 0; }
  return h.toString(16).padStart(8, '0') + g.toString(16).padStart(8, '0');
};

describe('Free Fly squares: kind', () => {
  it('is deterministic, about FREEFLY_SHARE, never the origin or its four neighbours', () => {
    let ff = 0;
    let n = 0;
    for (let y = -40; y <= 40; y++) for (let x = -40; x <= 40; x++) {
      expect(squareKind(x, y, SEED)).toBe(squareKind(x, y, SEED));
      if (W.isHole(x, y)) continue;
      n++;
      if (squareKind(x, y, SEED) === 'freefly') ff++;
    }
    expect(ff / n).toBeGreaterThan(FREEFLY_SHARE - 0.03);
    expect(ff / n).toBeLessThan(FREEFLY_SHARE + 0.03);
    // Over many world seeds (one seed alone may simply roll walls there): the origin and its neighbours stay walls.
    for (let sd = 1; sd <= 400; sd++) for (const [x, y] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) expect(squareKind(x, y, sd)).toBe('wall');
    expect(squareLevel(3, 5, SEED).kind).toBe(squareKind(3, 5, SEED));
  });

  it('is not stored in the save', () => {
    const p = defaultProgress();
    let ffKey = '';
    for (let x = 2; x < 40 && !ffKey; x++) if (squareKind(x, 0, SEED) === 'freefly') ffKey = sqKey(x, 0);
    p.frontier.sq[ffKey] = 2;
    const json = serializeProgress(p);
    expect(json).not.toMatch(/freefly|kind/);
    expect(JSON.parse(json).frontier).toEqual({ seed: SEED, sq: { [ffKey]: 2 } });
  });
});

describe('Free Fly squares: encounter', () => {
  it('wave equivalent is monotonic, at least 1 and capped', () => {
    let prev = 0;
    for (let t = 1; t <= 400; t++) {
      const w = waveEquivalent(t);
      expect(w).toBeGreaterThanOrEqual(prev);
      expect(w).toBeGreaterThanOrEqual(1);
      expect(w).toBeLessThanOrEqual(FF_WAVE_CAP);
      prev = w;
    }
    expect(waveEquivalent(400)).toBe(FF_WAVE_CAP);
    expect(waveEquivalent(45)).toBeGreaterThan(waveEquivalent(25));
  });

  it('outcome: half the time = passed, the full time = cleared, earlier = failed', () => {
    const D = FREEFLY_SQUARE_SECONDS;
    expect(encounterOutcome(D, D, true)).toBe('cleared');
    expect(encounterOutcome(D * 0.5, D, false)).toBe('passed');
    expect(encounterOutcome(D * 0.5 - 0.1, D, false)).toBe('failed');
    expect(encounterOutcome(D - 0.1, D, false)).toBe('passed');
    expect(encounterOutcome(3, D, false)).toBe('failed');
  });

  it('the plan is deterministic, starts with a group and ramps up', () => {
    let fly = null;
    for (let x = 2; x < 60 && !fly; x++) fly = squareLevel(x, 7, SEED).fly ?? null;
    expect(fly).not.toBeNull();
    const a = planEncounter(fly!);
    expect(planEncounter(fly!)).toEqual(a);
    expect(a.filter(s => s.at < 3).length).toBeGreaterThanOrEqual(2);
    const third = (lo: number, hi: number) => a.filter(s => s.at >= lo && s.at < hi).reduce((n, s) => n + SPECIES[s.defId].cost, 0);
    expect(third(40, 60)).toBeGreaterThan(third(3, 23));
    expect(Math.max(...a.map(s => s.at))).toBeLessThan(fly!.duration);
  });

  it('World plays an encounter: fixed tier, spike HP x1.6, ends survived at the duration', () => {
    let fly = null;
    for (let x = 2; x < 60 && !fly; x++) fly = squareLevel(x, 11, SEED).fly ?? null;
    const enc = (hpMul: number) => ({ plan: planEncounter(fly!), wave: fly!.wave, tier: fly!.tier, hpMul, duration: fly!.duration });
    const p = { x: 270, y: 800, active: false, type: 'mouse' as const, seen: true };
    rng.reset(1);
    const w1 = new World({ seed: 5, encounter: enc(1), grid: { hullId: 'dart', cells: [] } as any });
    rng.reset(1);
    const w2 = new World({ seed: 5, encounter: enc(1.6), grid: { hullId: 'dart', cells: [] } as any });
    w1.god = w2.god = true;
    for (let i = 0; i < 120; i++) { w1.update(1 / 60, p); w2.update(1 / 60, p); }
    expect(w1.tier).toBe(fly!.tier);
    expect(w1.mitosis.enemies.length).toBeGreaterThan(0);
    const e1 = w1.mitosis.enemies[0], e2 = w2.mitosis.enemies[0];
    expect(e2.maxHp / e1.maxHp).toBeCloseTo(1.6, 1);
    for (let i = 0; i < 60 * 70 && !w1.gameOver; i++) w1.update(1 / 60, p);
    expect(w1.survived).toBe(true);
    expect(w1.time).toBe(fly!.duration);
    expect(w1.tier).toBe(fly!.tier); // the tier does not grow with time in an encounter
  });

  it('booking: passed and cleared unlock neighbours, failed changes nothing, the Medal is paid once', () => {
    // A Free Fly medal square next to the cleared start area.
    let m: { x: number; y: number } | null = null;
    for (let r = 2; r < 30 && !m; r++) for (let x = -r; x <= r && !m; x++) for (const y of [-r, r]) if (!m && squareKind(x, y, SEED) === 'freefly' && W.hasMedal(x, y)) m = { x, y };
    expect(m).not.toBeNull();
    const store = new ProgressStore(null, defaultProgress());
    const n = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => ({ x: m!.x + dx, y: m!.y + dy })).find(q => !W.isHole(q.x, q.y))!;
    store.data.frontier.sq[sqKey(n.x, n.y)] = 2;
    const run = (outcome: 'cleared' | 'passed' | 'failed') => store.recordFrontierFly({ x: m!.x, y: m!.y, credits: 10, kills: 4, outcome });
    expect(run('failed').ok).toBe(true);
    expect(squareState(store.data.frontier, m!.x, m!.y)).toBe('available');
    expect(store.data.credits).toBe(10); // credits per kill every run
    expect(run('passed').medals).toBe(0);
    expect(squareState(store.data.frontier, m!.x, m!.y)).toBe('passed');
    expect(run('cleared').medals).toBe(1);
    expect(run('cleared').medals).toBe(0);
    expect(store.data.medals).toBe(1);
    expect(store.data.bestWave).toBe(0); // Free Fly records untouched
    expect(store.data.runs).toBe(4);
  });
});

describe('Normal Free Fly is unchanged (waves 1-30)', () => {
  // Hashes taken on main before chunk 15b touched World (scratch script, same code as below).
  it('director plans', () => {
    const plans: unknown[] = [];
    for (let w = 1; w <= 30; w++) plans.push(planWave(12345, w));
    expect(fnv(JSON.stringify(plans))).toBe('2105211837648497');
  });
  it('enemy stats of a real World 10 s into each wave', () => {
    const stats: unknown[] = [];
    for (let w = 1; w <= 30; w++) {
      rng.reset(1);
      const world = new World({ seed: 777, startWave: w });
      world.god = true;
      const p = { x: 270, y: 800, active: false, type: 'mouse' as const, seen: true };
      for (let i = 0; i < 600; i++) world.update(1 / 60, p);
      stats.push({ w, wave: world.wave, tier: world.tier, kills: world.kills, credits: world.creditsExact, e: world.mitosis.enemies.map(e => [e.defId, e.generation, e.hp, e.maxHp, e.armor, e.shield, e.maxShield, e.radius, Math.round(e.x * 100), Math.round(e.y * 100)]) });
    }
    expect(fnv(JSON.stringify(stats))).toBe('09979b64a71089a9');
  });
  it('species and enemy data', () => {
    expect(fnv(JSON.stringify([SPECIES, ENEMIES]))).toBe('f74a8445869d7bb8');
  });
});

describe('Directional unlocks', () => {
  it('table: 16 entries, rings [10, 25, 50, 100], 16 different blocks of the two newest batches, a spread of categories', () => {
    expect([...UNLOCK_RINGS]).toEqual([10, 25, 50, 100]);
    expect(UNLOCKS.length).toBe(16);
    const ids = UNLOCKS.map(u => u.blockId);
    expect(new Set(ids).size).toBe(16);
    const batches = ['alternator', 'delay_line', 'overclock', 'capacitor', 'executioner', 'boomerang', 'orbit', 'chain_lightning', 'mine', 'ignite', 'frostbite', 'corrosion',
      'fission_catalyst', 'cauterize', 'cleaver', 'culling_bolt', 'residue_seed', 'overkill_spill', 'gravity_well', 'static_charge', 'random_router'];
    expect([...ids, ...FREE_NEW_BLOCKS].sort()).toEqual([...batches].sort());
    for (const sec of ['N', 'E', 'S', 'W']) {
      const cats = new Set(UNLOCKS.filter(u => u.sector === sec).map(u => BLOCKS[u.blockId].category));
      expect(cats.size).toBeGreaterThanOrEqual(3);
    }
  });

  it('reach per sector: highest ring of a passed or cleared square in each sector', () => {
    const f = defaultFrontier();
    f.sq[sqKey(0, -12)] = 1; // North ring 12 (passed counts)
    f.sq[sqKey(3, -5)] = 2;  // North ring 5
    f.sq[sqKey(9, 0)] = 2;   // East ring 9 (lattice row y = 0, never a hole)
    f.sq[sqKey(-4, 4)] = 2;  // a diagonal tie: South
    expect(sector(-4, 4)).toBe('S');
    expect(reachBySector(f)).toEqual({ N: 12, E: 9, S: 4, W: 0 });
  });

  it('an unlock fires exactly once at its threshold, each sector on its own', () => {
    const store = new ProgressStore(null, defaultProgress());
    const lattice = (x: number, y: number) => { expect(W.isHole(x, y)).toBe(false); store.data.frontier.sq[sqKey(x, y)] = 2; };
    lattice(0, -9); store.commit();
    expect(store.takeUnlockNotices()).toEqual([]); // ring 9: below the threshold
    lattice(0, -10); store.commit();
    expect(store.takeUnlockNotices()).toEqual(['Unlocked: Random Router']);
    lattice(0, -11); store.commit();
    expect(store.takeUnlockNotices()).toEqual([]); // once
    expect(store.frontierReach.E).toBe(0);
    lattice(14, 0); store.commit(); // East ring 14
    expect(store.takeUnlockNotices()).toEqual(['Unlocked: Overkill Spill']);
    expect(newlyReached({ N: 0, E: 0, S: 0, W: 0 }, { N: 0, E: 0, S: 0, W: 100 }).map(u => u.blockId)).toEqual(['corrosion', 'gravity_well', 'residue_seed', 'alternator']);
  });

  it('shop gating: a gated block is refused until reached; ungated and free blocks are not gated', () => {
    const p = defaultProgress();
    p.credits = 1e9;
    expect(gateOf('flat_plus')).toBeUndefined();
    for (const id of FREE_NEW_BLOCKS) expect(gateOf(id)).toBeUndefined();
    expect(blockLockReason(p, 'chain_lightning')).toBe('Reach ring 100 North');
    expect(buyCopy(p, 'chain_lightning')).toEqual({ ok: false, error: 'Reach ring 100 North' });
    expect(buyUpgrade(p, 'chain_lightning').ok).toBe(false);
    expect(buyCopy(p, 'overclock').ok).toBe(true);
    p.frontier.sq[sqKey(0, -10)] = 1; // North ring 10 passed: Random Router
    expect(buyCopy(p, 'random_router').ok).toBe(true);
    expect(isBlockUnlocked('gravity_well', 0, { N: 0, E: 0, S: 0, W: 24 })).toBe(false);
    expect(isBlockUnlocked('gravity_well', 0, { N: 0, E: 0, S: 0, W: 25 })).toBe(true);
    expect(isBlockUnlocked('gravity_well', 0, { N: 99, E: 99, S: 99, W: 0 })).toBe(false); // the wrong direction does not count
  });

  it('grandfather rule: an old save that owns a gated block keeps it unlocked (no save change)', () => {
    const old = { version: 6, credits: 5000, owned: { chain_lightning: 2, orbit: 0 }, levels: { chain_lightning: 3 }, ownedHulls: ['dart'] };
    const p = loadProgress(JSON.stringify(old));
    expect(PROGRESS_VERSION).toBe(7);
    expect(p.owned.chain_lightning).toBe(2);
    expect(blockLockReason(p, 'chain_lightning')).toBeNull();
    expect(buyCopy(p, 'chain_lightning').ok).toBe(true);
    expect(blockLockReason(p, 'orbit')).toBe('Reach ring 50 South');
    const back = loadProgress(serializeProgress(p));
    expect(blockLockReason(back, 'chain_lightning')).toBeNull();
  });

  it('a square on a threshold ring names its unlock', () => {
    expect(unlockOnSquare(3, -25)?.blockId).toBe('cleaver');
    expect(unlockOnSquare(-50, 10)?.blockId).toBe('residue_seed');
    expect(unlockOnSquare(3, -24)).toBeUndefined();
    expect(ring(-50, 10)).toBe(50);
  });
});

describe('Look: one progress colour', () => {
  const isGrey = (c: number) => { const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255; return Math.max(r, g, b) - Math.min(r, g, b) <= 8; };
  it('passed = lavender outline, cleared = lavender fill without inner mark, everything else grey', () => {
    for (const kind of ['wall', 'freefly'] as const) for (const style of ['plate', 'flat'] as const) for (const far of [false, true]) {
      const passed = tileLook('passed', kind, style, far);
      expect(passed.edge).toBe(PROGRESS_COLOR);
      expect(passed.plate).toBe(AVAIL_PLATE);
      const cleared = tileLook('cleared', kind, style, far);
      expect(cleared.plate).toBe(PROGRESS_COLOR);
      expect(cleared.inner).toBeNull();
      expect(cleared.edge).toBeNull();
      for (const st of ['locked', 'available'] as const) {
        const l = tileLook(st, kind, style, far);
        expect(l.edge).toBeNull();
        expect(isGrey(l.plate)).toBe(true);
        if (l.inner) expect(isGrey(l.inner.color)).toBe(true);
      }
    }
    expect(isGrey(PROGRESS_COLOR)).toBe(false);
    expect(AVAIL_PLATE - LOCKED_PLATE).toBeGreaterThan(0x202020);
  });
  it('Free Fly squares have a round inner mark, walls a square one (plate style, locked and available)', () => {
    expect(tileLook('available', 'freefly', 'plate', false).inner?.shape).toBe('round');
    expect(tileLook('locked', 'freefly', 'plate', false).inner?.shape).toBe('round');
    expect(tileLook('available', 'wall', 'plate', false).inner?.shape).toBe('square');
    expect(tileLook('available', 'wall', 'flat', false).inner).toBeNull();
    expect(tileLook('available', 'freefly', 'flat', false).inner?.shape).toBe('dot');
  });
});
