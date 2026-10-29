// Chunk 21b: performance work. The spatial queries return what a brute-force scan would, Homing keeps and re-searches its target on a timer,
// the pool refuses and expires shots in the promised order, and the shot looks are five different shapes and colours.
import { describe, it, expect } from 'vitest';
import { Container } from 'pixi.js';
import { ProjectilePool } from '../src/engine/pools';
import { EnemyEntity, ListField, ProjectileSystem, PHASE_MINE_WAIT, PHASE_ORBIT } from '../src/engine/projectiles';
import { SpatialHash } from '../src/engine/spatialHash';
import { EnemyField, HomePick, newHomePick } from '../src/engine/targets';
import { HOMING_RETARGET, HOMING_STAGGER, homingConeDeg, homingRange } from '../src/engine/effects';
import { CONFIG } from '../src/config';
import { compile } from '../src/engine/compiler';
import { Gun } from '../src/game/fire';
import { spawnOffsetsFor } from '../src/game/fire';
import { perfGrid, PerfBuild } from '../scripts/lib/perfBuild';
import { WallWorld } from '../src/wall/wallWorld';
import { makeTestWall } from '../src/wall/level';
import { wrapDx } from '../src/engine/wrap';
import { WALL_COLS, CELL } from '../src/wall/constants';
import { SHOT_LOOKS, shotBand } from '../src/ui/shotLook';
import { ShotSprites } from '../src/ui/shotSprites';
import { shotTextures } from '../src/ui/shotTextures';
import { buildStarterGrid } from '../src/game/starter';

const DT = 1 / 60;
const RAD = Math.PI / 180;

/** A tiny seeded generator, so the random layouts are the same on every run. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

function rock(id: number, x: number, y: number, radius = 14, hp = 10): EnemyEntity {
  return { id, x, y, radius, hp, maxHp: hp, armor: 0, shield: 0, maxShield: 0 };
}

// ------------------------------------------------------------------ the spatial hash
describe('spatial hash', () => {
  it('queryInto finds every entity within the radius, in insertion order, once each (random layouts)', () => {
    const r = lcg(7);
    const hash = new SpatialHash(540, 960, 64);
    const buf: number[] = [];
    for (let round = 0; round < 40; round++) {
      hash.clear();
      const pts: { id: number; x: number; y: number }[] = [];
      const n = 5 + Math.floor(r() * 120);
      // Some points sit outside the grid on purpose (rocks above the top edge, shots a little off to the side).
      for (let id = 1; id <= n; id++) pts.push({ id, x: -60 + r() * 660, y: -80 + r() * 1100 });
      for (const p of pts) hash.insert(p.id, p.x, p.y);
      for (let q = 0; q < 25; q++) {
        const cx = -40 + r() * 620, cy = -40 + r() * 1040, rad = 5 + r() * 400;
        const got = hash.queryInto(cx, cy, rad, buf);
        expect(new Set(got).size, 'no id twice').toBe(got.length);
        const need = pts.filter(p => (p.x - cx) ** 2 + (p.y - cy) ** 2 <= rad * rad).map(p => p.id);
        for (const id of need) expect(got, `id ${id} within ${rad.toFixed(0)} of (${cx.toFixed(0)}, ${cy.toFixed(0)})`).toContain(id);
        const order = got.map(id => pts.findIndex(p => p.id === id));
        // Within one cell the order is the insertion order; across cells it is row by row, so only check pairs the same cell holds.
        const cellOf = (id: number) => { const p = pts[id - 1]; return Math.min(hash.cols - 1, Math.max(0, Math.floor(p.x / 64))) + hash.cols * Math.min(hash.rows - 1, Math.max(0, Math.floor(p.y / 64))); };
        for (let k = 1; k < got.length; k++) if (cellOf(got[k]) === cellOf(got[k - 1])) expect(order[k]).toBeGreaterThan(order[k - 1]);
      }
    }
  });

  it('clear forgets everything and the arrays grow past their first size', () => {
    const hash = new SpatialHash(540, 960, 64);
    for (let id = 0; id < 1000; id++) hash.insert(id, (id * 7) % 540, (id * 13) % 960);
    expect(hash.size).toBe(1000);
    expect(hash.query(270, 480, 2000).length).toBe(1000);
    hash.clear();
    expect(hash.size).toBe(0);
    expect(hash.query(270, 480, 2000)).toEqual([]);
  });
});

// ------------------------------------------------------------------ homing target search
/** The search Homing used before chunk 21b, written the plain way: every target, angle by atan2, nearest wins (the last of equals). */
function oldNearest(list: EnemyEntity[], x: number, y: number, heading: number, range: number, coneDeg: number, wrapW = 0): { e: EnemyEntity; d2: number } | null {
  let best = range * range;
  let found: EnemyEntity | null = null;
  for (const e of list) {
    if (e.hp <= 0) continue;
    const dx = wrapW > 0 ? wrapDx(e.x, x, wrapW) : e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > best) continue;
    let diff = Math.atan2(dy, dx) - heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    if (Math.abs(diff) > Math.min(Math.PI, (coneDeg / 2) * RAD)) continue;
    best = d2; found = e;
  }
  return found ? { e: found, d2: best } : null;
}

describe('homing target search', () => {
  it('Free Fly: the spatial-hash search picks the same rock as the old scan of every rock (random layouts, cones, ranges)', () => {
    const r = lcg(21);
    const pick: HomePick = newHomePick();
    for (let round = 0; round < 60; round++) {
      const list: EnemyEntity[] = [];
      const n = 1 + Math.floor(r() * 150);
      for (let id = 1; id <= n; id++) list.push(rock(id, 20 + r() * 500, -20 + r() * 1000, 6 + r() * 30, r() < 0.15 ? 0 : 10));
      const hash = new SpatialHash(540, 960, 64);
      for (const e of list) hash.insert(e.id, e.x, e.y);
      const field = new EnemyField(list, hash);
      const brute = new ListField();
      brute.items = list;
      for (let q = 0; q < 30; q++) {
        const x = r() * 540, y = r() * 960, heading = (r() * 2 - 1) * Math.PI;
        const copies = 1 + Math.floor(r() * 3);
        const range = homingRange(copies), cone = homingConeDeg(copies);
        const cosHalf = Math.cos(Math.min(Math.PI, (cone / 2) * RAD));
        const want = oldNearest(list, x, y, heading, range, cone);
        const hx = Math.cos(heading), hy = Math.sin(heading);
        const got = field.nearestInCone(x, y, range, hx, hy, cosHalf, pick);
        const got2 = brute.nearestInCone(x, y, range, hx, hy, cosHalf, pick);
        expect(got, `round ${round} query ${q}`).toBe(!!want);
        expect(got2).toBe(!!want);
        if (want) {
          expect(pick.target!.id).toBe(want.e.id);
          expect(pick.dx * pick.dx + pick.dy * pick.dy).toBeCloseTo(want.d2, 6);
        }
      }
    }
  });

  it('wall: the cell-lookup search finds a block as near as the old scan of every block does (ring wall, random shots)', () => {
    const r = lcg(5);
    const rows = 12;
    const level = makeTestWall({ tier: 3, rows, approachSpeed: 0 });
    // Punch random holes so the wall is not a full rectangle.
    const cells = level.cells.map(c => (c && r() < 0.8 ? c : null));
    const w = new WallWorld({ ...level, cells }, { grid: buildStarterGrid() });
    w.setWallOffset(500);
    const alive = w.blocks.filter((b): b is NonNullable<typeof b> => !!b);
    const pick = newHomePick();
    const W = WALL_COLS * CELL;
    for (let q = 0; q < 400; q++) {
      const x = r() * W, y = 100 + r() * 600, heading = (r() * 2 - 1) * Math.PI;
      const copies = 1 + Math.floor(r() * 3);
      const range = homingRange(copies), cone = homingConeDeg(copies);
      const want = oldNearest(alive, x, y, heading, range, cone, W);
      const got = w.field.nearestInCone(x, y, range, Math.cos(heading), Math.sin(heading), Math.cos(Math.min(Math.PI, (cone / 2) * RAD)), pick);
      expect(got, `query ${q}`).toBe(!!want);
      if (want) expect(pick.dx * pick.dx + pick.dy * pick.dy).toBeCloseTo(want.d2, 6); // equal distances may name different blocks
    }
  });
});

// ------------------------------------------------------------------ homing timing
/** Wraps a field so the tests can count the searches. */
function spyField(inner: ListField) {
  const spy = {
    searches: 0,
    nearestInCone: (px: number, py: number, range: number, hx: number, hy: number, cosHalf: number, out: HomePick) => { spy.searches++; return inner.nearestInCone(px, py, range, hx, hy, cosHalf, out); },
    byId: (id: number) => inner.byId(id),
  };
  return spy;
}

function homingRig(shots: number, targets: EnemyEntity[]) {
  const pool = new ProjectilePool(200);
  const sys = new ProjectileSystem(pool);
  sys.modifiersTable = [[{ type: 'homing', level: 1 }]];
  const list = new ListField();
  list.items = targets;
  const spy = spyField(list);
  const ids: number[] = [];
  for (let k = 0; k < shots; k++) {
    const i = pool.spawn(270, 800, 0, -1, 1, 0, 0);
    sys.init(i);
    ids.push(i);
  }
  return { pool, sys, spy, ids, list };
}

describe('homing keeps its target and searches on a timer', () => {
  it('a shot with no target in reach searches about every 0.1 s, not every frame', () => {
    const { sys, spy } = homingRig(1, []);
    for (let f = 0; f < 60; f++) sys.steer(DT, spy);
    expect(spy.searches).toBeGreaterThanOrEqual(8);
    expect(spy.searches).toBeLessThanOrEqual(11);
  });

  it('a volley of shots does not all search on the same frame (the first search is staggered over HOMING_STAGGER frames)', () => {
    const { sys, spy } = homingRig(60, []);
    let worst = 0, total = 0;
    for (let f = 0; f < 30; f++) {
      const before = spy.searches;
      sys.steer(DT, spy);
      worst = Math.max(worst, spy.searches - before);
      total += spy.searches - before;
    }
    expect(worst).toBeLessThanOrEqual(Math.ceil(60 / HOMING_STAGGER) + 1);
    expect(total).toBeGreaterThanOrEqual(120); // 60 shots, about 0.5 s: they do search
  });

  it('a locked shot keeps its target when a nearer one appears, and searches no more while it is locked', () => {
    const far = rock(1, 270, 500, 14, 100);
    const { pool, sys, spy, ids, list } = homingRig(1, [far]);
    for (let f = 0; f < 12; f++) sys.steer(DT, spy);
    expect(pool.homeId[ids[0]]).toBe(1);
    const searchesLocked = spy.searches;
    list.items.push(rock(2, 270, 700, 14, 100)); // nearer to the shot and dead ahead
    for (let f = 0; f < 60; f++) sys.steer(DT, spy);
    expect(pool.homeId[ids[0]]).toBe(1);
    expect(spy.searches).toBe(searchesLocked);
  });

  it('the lock ends when the target dies or leaves the cone, and a new one is found within 0.1 s', () => {
    const a = rock(1, 270, 500, 14, 100);
    const b = rock(2, 330, 480, 14, 100);
    const { pool, sys, spy, ids, list } = homingRig(1, [a, b]);
    // The shot flies straight up; its cone is 33 degrees wide. Both rocks are ahead; a is dead ahead and nearer.
    for (let f = 0; f < 12; f++) sys.steer(DT, spy);
    expect(pool.homeId[ids[0]]).toBe(1);
    a.hp = 0; // dies
    sys.steer(DT, spy);
    expect(pool.homeId[ids[0]]).not.toBe(1);
    for (let f = 0; f < Math.ceil(HOMING_RETARGET / DT) + 1; f++) sys.steer(DT, spy);
    expect(pool.homeId[ids[0]]).toBe(2);
    // Now move b far out of the cone (behind the shot).
    b.y = 900; b.x = 270;
    for (let f = 0; f < 3; f++) sys.steer(DT, spy);
    expect(pool.homeId[ids[0]]).toBe(-1);
    void list;
  });

  it('a locked shot turns toward its target (it still steers)', () => {
    const t = rock(1, 330, 500, 14, 100);
    const { pool, sys, spy, ids } = homingRig(1, [t]);
    pool.vx[ids[0]] = 0; pool.vy[ids[0]] = -600;
    for (let f = 0; f < 12; f++) { sys.steer(DT, spy); pool.x[ids[0]] += pool.vx[ids[0]] * DT; pool.y[ids[0]] += pool.vy[ids[0]] * DT; }
    expect(pool.vx[ids[0]]).toBeGreaterThan(0);
  });
});

// ------------------------------------------------------------------ the pool refuses and expires
describe('overload: spawn refusal order', () => {
  it('fork fragments are refused first, then Mirror clones, then +1 Projectile shots; normal shots only when the pool is full', () => {
    const o = CONFIG.OVERLOAD.REFUSE_FROM;
    expect(o.fork).toBeLessThan(o.mirror);
    expect(o.mirror).toBeLessThan(o.extra);
    expect(o.extra).toBeLessThan(o.normal);
    expect(o.normal).toBe(1);
    const pool = new ProjectilePool(100);
    const firstRefused = { fork: -1, mirror: -1, extra: -1, normal: -1 } as Record<string, number>;
    for (let n = 0; n <= 100; n++) {
      pool.count = n; // the count is all admits() reads
      for (const kind of Object.keys(firstRefused)) if (firstRefused[kind] < 0 && !pool.admits(kind as 'fork')) firstRefused[kind] = n;
    }
    expect(firstRefused).toEqual({ fork: 80, mirror: 88, extra: 94, normal: 100 });
    expect(pool.refused.fork).toBeGreaterThan(0);
  });

  function gunRig(max: number, build: Partial<PerfBuild>) {
    const grid = perfGrid({ plusOne: 2, mirror: true, fork: false, bouncing: 0, homing: 0, extender: 0, ...build });
    const compiled = compile(grid);
    const pool = new ProjectilePool(max);
    const sys = new ProjectileSystem(pool);
    sys.modifiersTable = compiled.recipes.map(r => r.packet.mods);
    const gun = new Gun(pool, sys, compiled.recipes, spawnOffsetsFor(compiled.recipes, grid));
    return { pool, sys, gun, compiled };
  }

  it('Gun: below the Mirror line a pulse makes its clones; between the Mirror and +1 lines only the clones are missing; above the +1 line only the lane shots; full: nothing', () => {
    const { pool, sys, gun, compiled } = gunRig(100, {});
    const perEjector = 3; // the shot and two +1 Projectile
    const ejectors = compiled.recipes.length / perEjector;
    const one = () => { const before = pool.count; gun.fire(270, 800); return pool.count - before; };
    const fill = (n: number) => { pool.count = n; };
    // Every pulse is measured from a fresh, empty pool whose count is faked, so each case is one pulse from one level.
    const run = (level: number) => { for (let i = 0; i < pool.max; i++) pool.free(i); fill(level); const m0 = sys.fx.mirrorClones; const made = one(); return { made, clones: sys.fx.mirrorClones - m0 }; };
    const low = run(10);
    expect(low.made).toBe(compiled.recipes.length * 2); // every shot has a clone
    expect(low.clones).toBe(compiled.recipes.length);
    const mid = run(90); // over 88 % (no clones); the +1 shots still come until the pool reaches 94 %
    expect(mid.clones).toBe(0);
    expect(mid.made).toBeGreaterThan(ejectors);
    expect(mid.made).toBeLessThanOrEqual(94 - 90 + ejectors);
    const high = run(96); // over 94 %: only each ejector's own shot
    expect(high.clones).toBe(0);
    expect(high.made).toBe(ejectors);
    const full = run(100);
    expect(full.made).toBe(0);
    expect(pool.refused.extra).toBeGreaterThan(0);
    expect(pool.refused.mirror).toBeGreaterThan(0);
  });

  it('the pool never holds more than its size, however hard the gun fires', () => {
    const { pool, gun } = gunRig(150, { plusOne: 6 });
    for (let k = 0; k < 40; k++) { gun.fire(270, 800); expect(pool.count).toBeLessThanOrEqual(150); }
    expect(pool.count).toBeGreaterThan(100);
  });
});

describe('overload: stale shots go first', () => {
  const view = (sys: ProjectileSystem) => { sys.viewCx = 270; sys.viewHalfW = 330; sys.viewTop = -60; sys.viewBottom = 1020; };

  function fillPool(max: number, n: number) {
    const pool = new ProjectilePool(max);
    const sys = new ProjectileSystem(pool);
    sys.modifiersTable = [[]];
    view(sys);
    for (let k = 0; k < n; k++) pool.spawn(270, 500, 0, -1, 1, 0, 0);
    return { pool, sys };
  }

  it('does nothing while the pool is under the threshold', () => {
    const { pool, sys } = fillPool(100, 80);
    for (let i = 0; i < 80; i++) { pool.age[i] = 9; pool.y[i] = -500; }
    expect(sys.expireStale()).toBe(0);
    expect(pool.count).toBe(80);
  });

  it('removes only shots that are off-screen AND have hit nothing for STALE_AGE; keeps the rest', () => {
    const { pool, sys } = fillPool(200, 190);
    const S = CONFIG.OVERLOAD.STALE_AGE;
    // 0-19 off-screen and stale; 20-39 off-screen but young; 40-59 on screen and stale; 60-79 off-screen, old, but hit a moment ago; 80-89 off-screen stale Orbit shots
    for (let i = 0; i < 190; i++) { pool.age[i] = 9; pool.hitAge[i] = 0; pool.y[i] = -500; }
    for (let i = 20; i < 40; i++) pool.age[i] = S * 0.5;
    for (let i = 40; i < 60; i++) pool.y[i] = 500;
    for (let i = 60; i < 80; i++) pool.hitAge[i] = 9 - 0.3;
    for (let i = 80; i < 190; i++) pool.phase[i] = PHASE_ORBIT;
    const n = sys.expireStale();
    expect(n).toBe(20);
    for (let i = 0; i < 20; i++) expect(pool.active[i], `slot ${i}`).toBe(0);
    for (let i = 20; i < 190; i++) expect(pool.active[i], `slot ${i}`).toBe(1);
    expect(pool.count).toBe(170);
  });

  it('a shot far to the side is off-screen; on a ring wall the short way round decides', () => {
    const { pool, sys } = fillPool(100, 90);
    sys.wrapW = 1000;
    sys.viewCx = 20; sys.viewHalfW = 120;
    for (let i = 0; i < 90; i++) { pool.age[i] = 9; pool.y[i] = 500; pool.x[i] = 20; }
    pool.x[0] = 970; // 50 px to the left of the view centre round the seam: on screen
    pool.x[1] = 600; // far: off screen
    expect(sys.expireStale()).toBe(1);
    expect(pool.active[0]).toBe(1);
    expect(pool.active[1]).toBe(0);
  });

  it('stops as soon as the pool is back under the threshold', () => {
    const { pool, sys } = fillPool(1000, 1000);
    for (let i = 0; i < 1000; i++) { pool.age[i] = 9; pool.y[i] = -500; }
    sys.expireStale();
    expect(pool.count).toBe(Math.ceil(1000 * CONFIG.OVERLOAD.EXPIRE_FROM) - 1);
  });

  it('a waiting Mine is never expired', () => {
    const { pool, sys } = fillPool(100, 90);
    for (let i = 0; i < 90; i++) { pool.age[i] = 9; pool.y[i] = -500; pool.phase[i] = PHASE_MINE_WAIT; }
    expect(sys.expireStale()).toBe(0);
  });
});

// ------------------------------------------------------------------ cached modifier facts
describe('modifier lists are read once', () => {
  it('changing a list the system has already seen (a new array in the table) takes effect', () => {
    const pool = new ProjectilePool(10);
    const sys = new ProjectileSystem(pool);
    const t = rock(1, 270, 500, 14, 100);
    const list = new ListField();
    list.items = [t];
    const i = pool.spawn(270, 800, 0, -600, 1, 0, 0);
    sys.modifiersTable = [[]];
    for (let f = 0; f < 20; f++) sys.steer(DT, list);
    expect(pool.homeId[i]).toBe(-1);
    sys.modifiersTable = [[{ type: 'homing', level: 1 }]];
    for (let f = 0; f < 20; f++) sys.steer(DT, list);
    expect(pool.homeId[i]).toBe(1);
  });
});

// ------------------------------------------------------------------ pool slots
describe('pool slots', () => {
  it('spawn still takes the lowest free slot, also after frees and after the pool was cleared by hand', () => {
    const pool = new ProjectilePool(20);
    const a = [0, 1, 2, 3, 4].map(() => pool.spawn(0, 0, 0, 0, 1));
    expect(a).toEqual([0, 1, 2, 3, 4]);
    pool.free(1); pool.free(3);
    expect(pool.spawn(0, 0, 0, 0, 1)).toBe(1);
    expect(pool.spawn(0, 0, 0, 0, 1)).toBe(3);
    expect(pool.spawn(0, 0, 0, 0, 1)).toBe(5);
    pool.active.fill(0); pool.count = 0; // what World.reset does
    expect(pool.spawn(0, 0, 0, 0, 1)).toBe(0);
    for (let k = 0; k < 19; k++) expect(pool.spawn(0, 0, 0, 0, 1)).toBeGreaterThanOrEqual(0);
    expect(pool.spawn(0, 0, 0, 0, 1)).toBe(-1);
  });
});

// ------------------------------------------------------------------ shot looks
describe('shot looks: five bands, five different looks', () => {
  it('the bands are the ones the player reads: dash, bar, diamond, bolt, star', () => {
    expect(SHOT_LOOKS.map(l => l.shape)).toEqual(['bar', 'bar', 'diamond', 'bolt', 'star']);
    const cases: [number, number][] = [[1, 0], [9, 0], [10, 1], [99, 1], [100, 2], [999, 2], [1000, 3], [9999, 3], [10000, 4]];
    for (const [d, b] of cases) expect(shotBand(d), String(d)).toBe(b);
  });

  it('no two bands share a colour (each is at least 80 apart in RGB) and the first is thinner than the second is long', () => {
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    for (let a = 0; a < SHOT_LOOKS.length; a++) {
      for (let b = a + 1; b < SHOT_LOOKS.length; b++) {
        const A = rgb(SHOT_LOOKS[a].color), B = rgb(SHOT_LOOKS[b].color);
        expect(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), `${a} vs ${b}`).toBeGreaterThan(80);
      }
    }
    expect(SHOT_LOOKS[0].w).toBeLessThan(SHOT_LOOKS[1].w);
    expect(SHOT_LOOKS[1].h).toBeGreaterThan(SHOT_LOOKS[0].h);
  });
});

describe('shot sprites', () => {
  function rig() {
    const layer = new Container();
    const pool = new ProjectilePool(10);
    const shots = new ShotSprites(layer, 10, shotTextures(null), 540, 960);
    return { pool, shots };
  }

  it('each sprite takes the look of its damage band, off-screen and free slots are hidden', () => {
    const { pool, shots } = rig();
    const damages = [5, 50, 500, 5000, 50000];
    damages.forEach((d, k) => { pool.spawn(100 + k * 50, 400, 0, -600, d); });
    pool.spawn(-500, 400, 0, -600, 5); // far to the left: off-screen
    shots.sync(pool);
    damages.forEach((_, k) => {
      expect(shots.sprites[k].visible, `slot ${k}`).toBe(true);
      expect(shots.sprites[k].tint, `slot ${k}`).toBe(SHOT_LOOKS[k].color);
      expect(shots.sprites[k].width, `slot ${k}`).toBe(SHOT_LOOKS[k].w);
      expect(shots.sprites[k].height, `slot ${k}`).toBe(SHOT_LOOKS[k].h);
    });
    expect(shots.sprites[5].visible).toBe(false);
    expect(shots.sprites[9].visible).toBe(false);
    expect(shots.drawn).toBe(5);
    pool.free(0);
    shots.sync(pool);
    expect(shots.sprites[0].visible).toBe(false);
  });

  it('a shot that grows into the next band changes look; a Fork copy is drawn smaller', () => {
    const { pool, shots } = rig();
    const i = pool.spawn(200, 400, 0, -600, 5);
    shots.sync(pool);
    expect(shots.sprites[i].tint).toBe(SHOT_LOOKS[0].color);
    pool.damage[i] = 500;
    pool.size[i] = 0.6;
    shots.sync(pool);
    expect(shots.sprites[i].tint).toBe(SHOT_LOOKS[2].color);
    expect(shots.sprites[i].width).toBeCloseTo(SHOT_LOOKS[2].w * 0.6, 5);
  });

  it('Orbit shots keep their own yellow bar whatever their damage', () => {
    const { pool, shots } = rig();
    const i = pool.spawn(200, 400, 0, -600, 50000);
    pool.phase[i] = PHASE_ORBIT;
    shots.sync(pool);
    expect(shots.sprites[i].tint).toBe(0xffe14d);
    expect(shots.sprites[i].width).toBe(6);
    expect(shots.sprites[i].height).toBe(14);
  });
});
