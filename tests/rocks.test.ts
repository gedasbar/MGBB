import { describe, it, expect } from 'vitest';
import { ENEMY_ART, FRAGMENT_LIFE, FragmentPool, enemyArt, rockShape, visibleCracks } from '../src/ui/rockArt';

const def = ENEMY_ART.mitotic_rock;

describe('rock art', () => {
  it('a rock keeps its shape (same id, same polygon) and ids give different rocks', () => {
    expect(rockShape(def, 42)).toEqual(rockShape(def, 42));
    const seen = new Set<string>();
    for (let id = 1; id <= 30; id++) {
      const s = rockShape(def, id);
      expect(s.outer.length).toBeGreaterThanOrEqual(6);
      expect(s.outer.length).toBeLessThanOrEqual(9);
      expect(s.cracks.length).toBeGreaterThanOrEqual(1);
      expect(s.cracks.length).toBeLessThanOrEqual(3);
      for (const [x, y] of s.outer) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.0001);
      seen.add(JSON.stringify(s.outer));
    }
    expect(seen.size).toBeGreaterThan(25);
  });

  it('cracks are hidden at full HP, the first shows at 25% damage and more follow, never more than the rock has', () => {
    expect(visibleCracks(def, 3, 0)).toBe(0);
    expect(visibleCracks(def, 3, 0.24)).toBe(0);
    expect(visibleCracks(def, 3, 0.25)).toBe(1);
    expect(visibleCracks(def, 3, 0.55)).toBe(2);
    expect(visibleCracks(def, 3, 0.9)).toBe(3);
    expect(visibleCracks(def, 1, 0.99)).toBe(1);
    let prev = 0;
    for (let d = 0; d <= 1; d += 0.05) { const n = visibleCracks(def, 3, d); expect(n).toBeGreaterThanOrEqual(prev); prev = n; }
  });

  it('a split emits 2 to 4 fragments from a fixed pool and they are gone after their short flight', () => {
    const pool = new FragmentPool(8);
    pool.emit(100, 100, 20, 5);
    expect(pool.live).toBeGreaterThanOrEqual(2);
    expect(pool.live).toBeLessThanOrEqual(4);
    pool.update(FRAGMENT_LIFE / 2);
    expect(pool.live).toBeGreaterThan(0);
    pool.update(FRAGMENT_LIFE);
    expect(pool.live).toBe(0);
    expect(enemyArt('nope')).toBe(def);
  });
});
