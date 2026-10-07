import { describe, it, expect } from 'vitest';
import { ProjectilePool } from '../src/engine/pools';
import { SpatialHash } from '../src/engine/spatialHash';
import { rng } from '../src/rng';

describe('Phase 1 Acceptance', () => {
  it('Projectile Pool should allocate and free correctly', () => {
    const pool = new ProjectilePool(10);
    expect(pool.count).toBe(0);
    
    const id = pool.spawn(0, 0, 10, 10, 100);
    expect(id).toBe(0);
    expect(pool.count).toBe(1);
    
    pool.free(id);
    expect(pool.count).toBe(0);
  });

  it('SpatialHash should query correctly', () => {
    const grid = new SpatialHash(1000, 1000, 50);
    grid.insert(1, 100, 100);
    grid.insert(2, 110, 110);
    grid.insert(3, 900, 900);
    
    const result = grid.query(105, 105, 20);
    expect(result).toContain(1);
    expect(result).toContain(2);
    expect(result).not.toContain(3);
  });

  it('RNG should be deterministic', () => {
    rng.reset(123);
    const a = rng.combat.next();
    const b = rng.combat.next();
    
    rng.reset(123);
    const a2 = rng.combat.next();
    const b2 = rng.combat.next();
    
    expect(a).toBe(a2);
    expect(b).toBe(b2);
  });
});
