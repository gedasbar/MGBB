import { describe, expect, it } from 'vitest';
import { generateLevel } from '../src/wall/generator';
import { countBlocks, rewardPerBlock } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';
import { buildStarterGrid } from '../src/game/starter';
import { defaultProgress, isFrontierUnlocked, loadProgress, ProgressStore, PROGRESS_VERSION, serializeProgress } from '../src/econ/progress';
import { BLOCK_K, FRONTIER_SEED, MAP_BASE_TIER, MAP_UNLOCK_TIER, MEDAL_BASE, MEDAL_MIN, START_SAFE_RING } from '../src/frontier/constants';
import { FrontierWorld, isLattice, medalChance, NEIGHBOURS, parseKey, ring, sector, sqKey } from '../src/frontier/world';
import { frontierLevel, squareLevel } from '../src/frontier/level';
import {
  applySquareRun, availableSquares, defaultFrontier, FrontierSave, frontierSquare, medalShown, nearestMedalSquare,
  sanitizeFrontier, squareState,
} from '../src/frontier/state';

const SEED = FRONTIER_SEED;
const R = 60;

/** Squares with ring <= r. */
function* squares(r: number) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) yield [x, y] as const;
}

describe('Frontier world', () => {
  it('helpers: ring, sector (ties go North / South), keys', () => {
    expect(ring(3, -7)).toBe(7);
    expect(sector(5, 2)).toBe('E');
    expect(sector(-5, 2)).toBe('W');
    expect(sector(2, -5)).toBe('N');
    expect(sector(2, 5)).toBe('S');
    expect(sector(4, -4)).toBe('N');
    expect(sector(-4, 4)).toBe('S');
    expect(sector(0, 0)).toBe('C');
    expect(parseKey(sqKey(-12, 40))).toEqual({ x: -12, y: 40 });
    expect(parseKey('1,2,3')).toBeNull();
    expect(parseKey('a,2')).toBeNull();
  });

  it('is deterministic: the same seed gives the same holes and medals, another seed a different world', () => {
    const a = new FrontierWorld(SEED);
    const b = new FrontierWorld(SEED);
    const c = new FrontierWorld(SEED + 1);
    let same = 0;
    let diff = 0;
    for (const [x, y] of squares(40)) {
      expect(a.isHole(x, y)).toBe(b.isHole(x, y));
      expect(a.hasMedal(x, y)).toBe(b.hasMedal(x, y));
      if (a.isHole(x, y) === c.isHole(x, y)) same++; else diff++;
    }
    expect(diff).toBeGreaterThan(same * 0.1);
  });

  it('start area has no holes; the lattice is never a hole; holes exist at about the planned density', () => {
    const w = new FrontierWorld(SEED);
    for (const [x, y] of squares(START_SAFE_RING)) expect(w.isHole(x, y)).toBe(false);
    let holes = 0;
    let interior = 0;
    for (const [x, y] of squares(R)) {
      if (isLattice(x, y)) { expect(w.isHole(x, y)).toBe(false); continue; }
      interior++;
      if (w.isHole(x, y)) holes++;
    }
    expect(holes / interior).toBeGreaterThan(0.18);
    expect(holes / interior).toBeLessThan(0.35);
  });

  it('connectivity: BFS from the origin over open squares reaches every open square within ring 60', () => {
    const w = new FrontierWorld(SEED);
    const B = R + BLOCK_K; // search a little wider so paths may leave the box and come back
    const seen = new Set<string>([sqKey(0, 0)]);
    const q: [number, number][] = [[0, 0]];
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (ring(nx, ny) > B || w.isHole(nx, ny)) continue;
        const k = sqKey(nx, ny);
        if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    let open = 0;
    for (const [x, y] of squares(R)) if (!w.isHole(x, y)) { open++; expect(seen.has(sqKey(x, y))).toBe(true); }
    expect(open).toBeGreaterThan(10000);
  });

  it('has dead-end pockets on purpose', () => {
    const w = new FrontierWorld(SEED);
    let pockets = 0;
    for (const [x, y] of squares(40)) if (w.isPocket(x, y)) pockets++;
    expect(pockets).toBeGreaterThan(20);
  });

  it('medals: never on holes, the lattice or the origin; the rate falls with distance', () => {
    const w = new FrontierWorld(SEED);
    expect(medalChance(0, false)).toBeCloseTo(MEDAL_BASE, 6);
    expect(medalChance(1000, false)).toBeCloseTo(MEDAL_MIN, 3);
    expect(medalChance(5, true)).toBeGreaterThan(medalChance(5, false));
    const rate = (r0: number, r1: number) => {
      let m = 0;
      let n = 0;
      for (let y = -r1; y <= r1; y++) for (let x = -r1; x <= r1; x++) {
        const r = ring(x, y);
        if (r < r0 || r > r1 || isLattice(x, y) || w.isHole(x, y)) continue;
        n++;
        if (w.hasMedal(x, y)) m++;
      }
      return m / n;
    };
    for (const [x, y] of squares(30)) if (w.hasMedal(x, y)) { expect(w.isHole(x, y)).toBe(false); expect(isLattice(x, y)).toBe(false); }
    expect(w.hasMedal(0, 0)).toBe(false);
    const near = rate(1, 12);
    const far = rate(100, 112);
    expect(near).toBeGreaterThan(0.05);
    expect(far).toBeLessThan(near * 0.6);
    expect(far).toBeGreaterThan(0.01);
  });

  it('generates blocks on demand only', () => {
    const w = new FrontierWorld(SEED);
    w.isHole(1_000_001, -3_000_002);
    w.isHole(1_000_002, -3_000_001);
    expect(w.cachedBlocks).toBe(1);
  });
});

describe('Frontier square levels', () => {
  it('squareLevel is deterministic and builds a wall through the campaign generator', () => {
    expect(squareLevel(7, -3, SEED)).toEqual(squareLevel(7, -3, SEED));
    const a = frontierLevel(squareLevel(7, -3, SEED));
    const b = frontierLevel(squareLevel(7, -3, SEED));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.frontier).toEqual({ x: 7, y: -3 });
    expect(a.campaign).toBeUndefined();
    expect(countBlocks(a)).toBeGreaterThan(50);
  });

  it('starts at the base tier and grows with the ring', () => {
    expect(Math.abs(squareLevel(1, 0, SEED).tier - MAP_BASE_TIER)).toBeLessThanOrEqual(2);
    const avg = (r: number, f: (p: ReturnType<typeof squareLevel>) => number) => {
      let s = 0;
      for (let x = -r; x <= r; x++) s += f(squareLevel(x, -r, SEED));
      return s / (2 * r + 1);
    };
    expect(avg(80, p => p.hp)).toBeGreaterThan(avg(5, p => p.hp) * 2);
    expect(avg(80, p => p.tier)).toBeGreaterThan(avg(5, p => p.tier) + 15);
  });

  it('varies other levers too, not only HP: rows, armor, shields, speed, template, spikes', () => {
    const ps = [];
    for (let x = 0; x < 200; x++) ps.push(squareLevel(x, 20, SEED)); // one ring band (20..199) is enough to see spread
    const ring20: ReturnType<typeof squareLevel>[] = [];
    for (let x = -20; x <= 20; x++) ring20.push(squareLevel(x, -20, SEED));
    const spread = (f: (p: ReturnType<typeof squareLevel>) => number) => {
      const v = ring20.map(f);
      return Math.max(...v) / Math.min(...v);
    };
    // Same ring, so HP differs only by its ±10% noise; the other levers spread much wider.
    expect(spread(p => p.rows)).toBeGreaterThan(1.5);
    expect(spread(p => p.armorFrac)).toBeGreaterThan(2.5);
    expect(spread(p => p.shieldFrac)).toBeGreaterThan(2.5);
    expect(spread(p => p.approachSpeed)).toBeGreaterThan(1.25);
    expect(new Set(ring20.map(p => p.template)).size).toBeGreaterThanOrEqual(5);
    const spikes = ps.filter(p => p.spike).length / ps.length;
    expect(spikes).toBeGreaterThan(0.06);
    expect(spikes).toBeLessThan(0.2);
    const spike = ps.find(p => p.spike)!;
    expect(frontierLevel(spike).spike).toBe(true);
    expect(squareLevel(0, 0, SEED).spike).toBe(false);
  });
});

describe('Campaign tiers are unchanged by the Frontier', () => {
  // Two FNV-style 32-bit hashes and the length of JSON.stringify(generateLevel(t)), taken with main's generator before
  // chunk 15a touched it.
  const fnv = (s: string) => {
    let h = 0x811c9dc5;
    let g = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h = Math.imul(h ^ c, 0x01000193) >>> 0; g = Math.imul(g ^ c, 0x5bd1e995) >>> 0; }
    return h.toString(16).padStart(8, '0') + g.toString(16).padStart(8, '0');
  };
  const SNAP: Record<number, [string, number]> = {
    1: ['76e35c05da9d477e', 2618], 10: ['25429cf3fcdd20fe', 4558], 25: ['0d28f9a0b9f6baef', 9816], 50: ['e9a040401b93c773', 18776], 100: ['120e08645e947e29', 28877],
  };
  for (const t of [1, 10, 25, 50, 100]) {
    it(`tier ${t}`, () => {
      const j = JSON.stringify(generateLevel(t));
      expect([fnv(j), j.length]).toEqual(SNAP[t]);
    });
  }
});

/** Finds an open square of the given ring next to an open neighbour chain from the origin (for progress tests). */
const W = new FrontierWorld(SEED);

describe('Frontier progress', () => {
  it('origin starts cleared, its open neighbours available, the rest locked', () => {
    const f = defaultFrontier();
    expect(squareState(f, 0, 0)).toBe('cleared');
    for (const [dx, dy] of NEIGHBOURS) expect(squareState(f, dx, dy)).toBe('available');
    expect(squareState(f, 2, 0)).toBe('locked');
    expect(squareState(f, 1, 1)).toBe('locked');
  });

  it('clearing a square opens its neighbours', () => {
    const f = defaultFrontier();
    const r = applySquareRun(f, 1, 0, { cleared: true, passed: true });
    expect(r.ok && r.newlyCleared).toBe(true);
    expect(squareState(f, 1, 0)).toBe('cleared');
    expect(squareState(f, 2, 0)).toBe('available');
    expect(squareState(f, 1, -1)).toBe('available');
    expect(squareState(f, 1, 1)).toBe('available');
  });

  it('passing a square opens its neighbours too, without filling it', () => {
    const f = defaultFrontier();
    const r = applySquareRun(f, 0, 1, { cleared: false, passed: true });
    expect(r.newlyPassed).toBe(true);
    expect(r.newlyCleared).toBe(false);
    expect(squareState(f, 0, 1)).toBe('passed');
    expect(squareState(f, 0, 2)).toBe('available');
    expect(squareState(f, 1, 1)).toBe('available');
  });

  it('a crash changes nothing; a locked square cannot be played; a pass never downgrades a clear', () => {
    const f = defaultFrontier();
    expect(applySquareRun(f, 1, 0, { cleared: false, passed: false }).newlyPassed).toBe(false);
    expect(squareState(f, 1, 0)).toBe('available');
    expect(applySquareRun(f, 5, 5, { cleared: true, passed: true }).ok).toBe(false);
    expect(squareState(f, 5, 5)).toBe('locked');
    applySquareRun(f, 1, 0, { cleared: true, passed: true });
    applySquareRun(f, 1, 0, { cleared: false, passed: true });
    expect(squareState(f, 1, 0)).toBe('cleared');
  });

  it('holes never become available, even with every neighbour cleared', () => {
    // A hole next to the lattice: clear all its open neighbours.
    let hole: { x: number; y: number } | null = null;
    for (const [x, y] of squares(20)) if (W.isHole(x, y)) { hole = { x, y }; break; }
    expect(hole).not.toBeNull();
    const f: FrontierSave = defaultFrontier();
    for (const [dx, dy] of NEIGHBOURS) if (!W.isHole(hole!.x + dx, hole!.y + dy)) f.sq[sqKey(hole!.x + dx, hole!.y + dy)] = 2;
    expect(squareState(f, hole!.x, hole!.y)).toBe('hole');
    expect(applySquareRun(f, hole!.x, hole!.y, { cleared: true, passed: true }).ok).toBe(false);
    expect(availableSquares(f).some(s => s.x === hole!.x && s.y === hole!.y)).toBe(false);
  });

  it('a medal square pays one Medal on the first clear only; passing keeps the marker', () => {
    let m: { x: number; y: number } | null = null;
    for (const [x, y] of squares(20)) if (W.hasMedal(x, y)) { m = { x, y }; break; }
    expect(m).not.toBeNull();
    const f = defaultFrontier();
    // Make it available: pretend a neighbour was passed.
    const n = NEIGHBOURS.map(([dx, dy]) => ({ x: m!.x + dx, y: m!.y + dy })).find(s => !W.isHole(s.x, s.y))!;
    f.sq[sqKey(n.x, n.y)] = 1;
    expect(medalShown(f, m!.x, m!.y)).toBe(true);
    expect(applySquareRun(f, m!.x, m!.y, { cleared: false, passed: true }).medals).toBe(0);
    expect(squareState(f, m!.x, m!.y)).toBe('passed');
    expect(medalShown(f, m!.x, m!.y)).toBe(true);
    expect(applySquareRun(f, m!.x, m!.y, { cleared: true, passed: true }).medals).toBe(1);
    expect(medalShown(f, m!.x, m!.y)).toBe(false);
    expect(applySquareRun(f, m!.x, m!.y, { cleared: true, passed: true }).medals).toBe(0);
    // The captain's doubling applies as on campaign first clears.
    const g = defaultFrontier();
    g.sq[sqKey(n.x, n.y)] = 1;
    const d = applySquareRun(g, m!.x, m!.y, { cleared: true, passed: true, medalDouble: 1, rand: () => 0 });
    expect(d.medals).toBe(2);
    // A square without a medal pays none.
    const h = defaultFrontier();
    const plain = NEIGHBOURS.map(([dx, dy]) => ({ x: dx, y: dy })).find(s => !W.hasMedal(s.x, s.y))!;
    expect(applySquareRun(h, plain.x, plain.y, { cleared: true, passed: true }).medals).toBe(0);
  });

  it('finders: the frontier square is the farthest available one, the medal finder only returns available medal squares', () => {
    const f = defaultFrontier();
    for (let x = 1; x <= 6; x++) f.sq[sqKey(x, 0)] = 2; // lattice row y = 0 is always open
    expect(frontierSquare(f)).toEqual({ x: 7, y: 0 });
    const m = nearestMedalSquare(f, { x: 0, y: 0 });
    if (m) { expect(squareState(f, m.x, m.y)).toBe('available'); expect(W.hasMedal(m.x, m.y)).toBe(true); }
  });

  it('sanitizer: keeps good entries, drops garbage, holes and the origin', () => {
    let hole = '';
    for (const [x, y] of squares(20)) if (W.isHole(x, y)) { hole = sqKey(x, y); break; }
    const f = sanitizeFrontier({ seed: SEED, sq: { '1,0': 2, '0,1': 1, '0,0': 2, [hole]: 2, 'x,y': 1, '2,0': 3, '3,0': '2' } });
    expect(f.sq).toEqual({ '1,0': 2, '0,1': 1 });
    expect(sanitizeFrontier(null)).toEqual(defaultFrontier());
    expect(sanitizeFrontier({ seed: 'no', sq: 5 })).toEqual(defaultFrontier());
  });
});

describe('Frontier save (v7) and the wall run hook', () => {
  it('a v6 save loads with an empty Frontier; a v7 save round-trips the squares', () => {
    const v6 = { version: 6, credits: 40, clearedTiers: [1, 2, 3], passedTiers: [1, 2, 3], medals: 5 };
    const p = loadProgress(JSON.stringify(v6));
    expect(PROGRESS_VERSION).toBe(7);
    expect(p.version).toBe(7);
    expect(p.frontier).toEqual(defaultFrontier());
    expect(p.medals).toBe(5);
    p.frontier.sq['1,0'] = 2;
    p.frontier.sq['0,-1'] = 1;
    const back = loadProgress(serializeProgress(p));
    expect(back.frontier.sq).toEqual({ '1,0': 2, '0,-1': 1 });
    expect(back.frontier.seed).toBe(FRONTIER_SEED);
  });

  it('unlocks after campaign tier 25 is passed', () => {
    const p = defaultProgress();
    expect(isFrontierUnlocked(p)).toBe(false);
    p.passedTiers = Array.from({ length: MAP_UNLOCK_TIER - 1 }, (_, i) => i + 1);
    expect(isFrontierUnlocked(p)).toBe(false);
    p.passedTiers.push(MAP_UNLOCK_TIER);
    expect(isFrontierUnlocked(p)).toBe(true);
  });

  it('a real WallWorld run on a square books credits like the campaign and clears the square', () => {
    const store = new ProgressStore(null, defaultProgress());
    const params = squareLevel(1, 0, SEED);
    const level = frontierLevel(params);
    const w = new WallWorld(level, { grid: buildStarterGrid() });
    w.destroyAll();
    const expected = Math.floor(countBlocks(level) * rewardPerBlock(params.tier));
    w.bank(store);
    expect(store.data.credits).toBe(expected);
    expect(store.data.frontier.sq['1,0']).toBe(2);
    expect(squareState(store.data.frontier, 2, 0)).toBe('available');
    expect(store.data.clearedTiers).toEqual([]); // the campaign is untouched
    // A crash on another square books the credits of the blocks it destroyed and nothing else.
    const w2 = new WallWorld(frontierLevel(squareLevel(0, 1, SEED)), { grid: buildStarterGrid() });
    w2.bank(store);
    expect(store.data.frontier.sq['0,1']).toBeUndefined();
    expect(store.data.runs).toBe(2);
  });
});
