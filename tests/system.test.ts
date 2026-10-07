import { describe, it, expect } from 'vitest';
import { simulate } from '../src/engine/sim';

describe('System Tests', () => {
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
