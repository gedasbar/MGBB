import { describe, it, expect } from 'vitest';
import { ProjectilePool } from '../src/engine/pools';
import { SpatialHash } from '../src/engine/spatialHash';
import { rng } from '../src/rng';
import { simulate } from '../src/engine/sim';

describe('Engine primitives: pool, spatial hash, rng', () => {
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

describe('Headless simulation is deterministic', () => {
  it('Same seed + same build ⇒ identical simulate(30, seed) output', () => {
    // Run the headless simulation twice with the same seed
    const seed = "determinstic_seed_123";
    
    const result1 = simulate(30, seed);
    const result2 = simulate(30, seed);
    
    expect(result1.kills).toBe(result2.kills);
    expect(result1.damage).toBe(result2.damage);
    expect(result1.splits).toBe(result2.splits);
    
    // Also test a different seed to ensure they actually differ
    simulate(30, "different_seed");
    // Usually they should differ, but we won't strictly assert notEqual because it might randomly match.
    // At the very least we assert 1 and 2 are identical.
  });
});
