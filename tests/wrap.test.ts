import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config';
import { World } from '../src/game/world';
import { wrapDist, wrapDx, wrapX, WORLD_W } from '../src/engine/wrap';
import { SpatialHash } from '../src/engine/spatialHash';
import { ProjectilePool } from '../src/engine/pools';
import { ProjectileSystem, EnemyEntity } from '../src/engine/projectiles';
import { leashStep, ringSpawnPoint, LEASH_FAR_TIME, LEASH_NEAR, LEASH_NEAR_TIME, LEASH_RELEASE } from '../src/game/leash';
import { PointerState } from '../src/input';

const VW = CONFIG.VIEW.W;
const idle = (): PointerState => ({ x: 270, y: 480, active: false, type: 'mouse', seen: false });
const rockAt = (id: number, x: number, y: number, hp = 100): EnemyEntity =>
  ({ id, x, y, radius: 20, hp, maxHp: hp, armor: 0, shield: 0, maxShield: 0 });

describe('wrap math', () => {
  it('the world is three viewports wide and wrapX folds into [0, W)', () => {
    expect(WORLD_W).toBe(3 * VW);
    expect(wrapX(-10)).toBe(WORLD_W - 10);
    expect(wrapX(WORLD_W + 7)).toBe(7);
    expect(wrapX(5 * WORLD_W + 3)).toBe(3);
  });

  it('wrapDx is antisymmetric and always within [-W/2, W/2)', () => {
    for (let i = 0; i < 400; i++) {
      const a = (i * 37.31) % WORLD_W;
      const b = (i * 91.77 + 13) % WORLD_W;
      const d = wrapDx(a, b);
      expect(d).toBeGreaterThanOrEqual(-WORLD_W / 2);
      expect(d).toBeLessThan(WORLD_W / 2);
      expect(wrapDx(b, a)).toBeCloseTo(-d, 9);
      expect(wrapX(b + d)).toBeCloseTo(a, 6);
    }
    expect(wrapDx(WORLD_W / 2, 0)).toBe(-WORLD_W / 2); // the half-way point lands on the closed end
  });

  it('an enemy at W-10 and a ship at 10 are 20 apart', () => {
    expect(wrapDx(10, WORLD_W - 10)).toBe(20);
    expect(wrapDx(WORLD_W - 10, 10)).toBe(-20);
    expect(wrapDist(WORLD_W - 10, 100, 10, 100)).toBe(20);
  });

  it('the spatial hash finds neighbours across the seam and does not repeat them', () => {
    const h = new SpatialHash(WORLD_W, 960, 64, WORLD_W);
    h.insert(1, WORLD_W - 5, 100);
    h.insert(2, 5, 100);
    h.insert(3, WORLD_W / 2, 100);
    const near = h.query(8, 100, 30);
    expect(near.sort()).toEqual([1, 2]);
    expect(h.query(WORLD_W - 8, 100, 30).sort()).toEqual([1, 2]);
    expect(h.query(WORLD_W / 2, 100, WORLD_W).length).toBe(3);
  });
});

describe('Free Fly pipeline on the cylinder', () => {
  it('a projectile crossing the seam hits an enemy on the other side', () => {
    const w = new World({ autoSpawn: false });
    w.shipY = 900;
    const rock = w.spawnRock(6, 300, 500)!;
    const hp0 = rock.hp;
    // 4 px left of the seam, flying right at 600 px/s: it wraps to x ~ 6 within a step and meets the rock.
    w.pool.spawn(WORLD_W - 4, 300, 600, 0, 100, 0, 0);
    w.update(1 / 60, idle());
    expect(rock.hp).toBeLessThan(hp0);
    expect(w.pool.count).toBe(0);
  });

  it('a rock spawned across the seam is folded into the world, and its mitosis children land on both sides', () => {
    const w = new World({ autoSpawn: false });
    const rock = w.spawnRock(-3, 100)!;
    expect(rock.x).toBe(WORLD_W - 3);
    w.mitosis.handleDeath(rock, 0);
    expect(w.mitosis.enemies.length).toBeGreaterThan(0);
    for (const c of w.mitosis.enemies) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(WORLD_W);
    }
  });

  it('homing steers the short way across the seam', () => {
    const pool = new ProjectilePool(4);
    const sys = new ProjectileSystem(pool);
    sys.modifiersTable = [[{ type: 'homing', level: 1 }]];
    sys.wrapW = WORLD_W;
    // Projectile just right of the seam flying up; the target is 65 px to its LEFT across the seam, 100 px ahead.
    const i = pool.spawn(5, 500, 0, -600, 10, 0, 0);
    sys.steer(1 / 60, [rockAt(1, WORLD_W - 25, 400)]);
    expect(pool.vx[i]).toBeLessThan(0);
    // Without wrapping the same target is 1600 px away to the right: out of range, so no steering at all.
    const plain = new ProjectilePool(4);
    const sys2 = new ProjectileSystem(plain);
    sys2.modifiersTable = sys.modifiersTable;
    const j = plain.spawn(5, 500, 0, -600, 10, 0, 0);
    sys2.steer(1 / 60, [rockAt(1, WORLD_W - 25, 400)]);
    expect(plain.vx[j]).toBe(0);
  });

  it('an AoE blast hits enemies on both sides of the seam', () => {
    const w = new World({ autoSpawn: false });
    w.projSys.modifiersTable = [[{ type: 'aoe_circle', radius: 60 }]];
    const a = w.spawnRock(WORLD_W - 30, 300, 100)!;
    const b = w.spawnRock(30, 300, 100)!;
    w.pool.spawn(WORLD_W - 28, 300, 0, 0, 40, 0, 0);
    w.update(1 / 600, idle());
    expect(a.hp).toBeLessThan(100);
    expect(b.hp).toBeLessThan(100);
  });
});

describe('enemy leash and spawn ring', () => {
  const at = (x: number, y: number) => ({ x, y, farT: 0, farT2: 0 });

  it('an enemy within range is left alone', () => {
    const e = at(300, 400);
    for (let i = 0; i < 60 * 30; i++) expect(leashStep(e, 270, 700, 1 / 60)).toBe('none');
    expect(e.farT).toBe(0);
  });

  it('a rock parked far away is pulled after 4 s and sent back to the ring after 10 s more', () => {
    // 2.2 viewports away: half the world to the side plus most of a screen up.
    const e = at(WORLD_W / 2 + 270, -300);
    let pullAt = -1;
    let respawnAt = -1;
    for (let i = 1; i <= 60 * 20 && respawnAt < 0; i++) {
      const a = leashStep(e, 270, 700, 1 / 60);
      if (a === 'pull' && pullAt < 0) pullAt = i / 60;
      if (a === 'respawn') respawnAt = i / 60;
    }
    expect(pullAt).toBeGreaterThan(LEASH_NEAR_TIME - 0.05);
    expect(pullAt).toBeLessThan(LEASH_NEAR_TIME + 0.1);
    expect(respawnAt).toBeGreaterThan(LEASH_FAR_TIME - 0.02);
    expect(respawnAt).toBeLessThan(LEASH_FAR_TIME + 0.1);
  });

  it('in the world, a far rock closes in on the ship and a near one keeps its own drift', () => {
    const w = new World({ autoSpawn: false });
    w.shipY = 700;
    const far = w.spawnRock(wrapX(w.shipX + WORLD_W / 2 - 60), 600)!;   // about 1.5 viewports to the side, level with the ship
    const near = w.spawnRock(w.shipX + 100, 100)!;
    const d0 = Math.abs(wrapDx(far.x, w.shipX));
    for (let i = 0; i < 60 * 12; i++) w.update(1 / 60, idle());
    expect(d0).toBeGreaterThan(LEASH_NEAR * VW);
    expect(wrapDist(far.x, far.y, w.shipX, w.shipY)).toBeLessThan(LEASH_RELEASE * VW + 5);   // pulled well inside the leash
    expect(near.vy).toBeCloseTo(40, 5);
  });

  it('the spawn ring is always off-screen and never below the view', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const camX of [0, 500, WORLD_W - 100]) {
      for (let i = 0; i < 300; i++) {
        const p = ringSpawnPoint(camX, rand);
        const sx = wrapDx(p.x, camX + VW / 2);          // relative to the screen centre
        const inside = Math.abs(sx) <= VW / 2 && p.y >= 0 && p.y <= CONFIG.VIEW.H;
        expect(inside).toBe(false);
        expect(p.y).toBeLessThan(CONFIG.VIEW.H * 0.6);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(WORLD_W);
      }
    }
  });
});
