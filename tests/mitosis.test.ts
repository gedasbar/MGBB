import { describe, it, expect } from 'vitest';
import { MitosisSystem } from '../src/engine/mitosis';
import { CONFIG } from '../src/config';

describe('Mitosis', () => {
  it('Binary rock with hpShare 0.55 × 2 children spawns children whose total max HP ≈ 1.1 × parent.', () => {
    const sys = new MitosisSystem();
    const parent = sys.spawn('mitotic_rock', 0, 100, 0, 0, 10)!;
    
    sys.handleDeath(parent, 0, false, false);
    
    expect(sys.enemies.length).toBe(2);
    const totalHp = sys.enemies[0].hp + sys.enemies[1].hp;
    expect(totalHp).toBeCloseTo(110);
  });

  it('Generation cap prevents splitting beyond MAX_GENERATION.', () => {
    const sys = new MitosisSystem();
    const parent = sys.spawn('mitotic_rock', CONFIG.MITOSIS.MAX_GENERATION, 100, 0, 0, 10)!;
    
    sys.handleDeath(parent, 0, false, false);
    
    expect(sys.enemies.length).toBe(0); // None spawned
  });

  it('Over-budget splits spawn one aggregated child with the merge bonus; the total live enemy count never exceeds CAPS.ENEMIES.', () => {
    const sys = new MitosisSystem();
    // Fill up to cap - 1
    for (let i = 0; i < CONFIG.CAPS.ENEMIES - 1; i++) {
      sys.spawn('mitotic_rock', 1, 100, 0, 0, 10);
    }
    expect(sys.enemies.length).toBe(CONFIG.CAPS.ENEMIES - 1);
    
    
    
    // Parent dies, tries to spawn 2 children (binary rock). 
    // We only have 1 space left (parent died, so length is CAP-2, so we have 2 spaces? Wait.
    // Length is CAP - 1. Parent dies -> length becomes CAP - 2. Space is 2.
    // It CAN spawn 2!
    // So let's fill to CAP.
    sys.spawn('mitotic_rock', 1, 100, 0, 0, 10);
    expect(sys.enemies.length).toBe(CONFIG.CAPS.ENEMIES);
    
    const parent2 = sys.enemies[0];
    
    // Parent dies -> length is CAP - 1. Space is 1.
    // Tries to spawn 2. Should aggregate.
    sys.handleDeath(parent2, 0, false, false);
    
    expect(sys.enemies.length).toBe(CONFIG.CAPS.ENEMIES); // Spawns exactly 1, returning to cap
    
    // The spawned child is the last one in the array
    const child = sys.enemies[sys.enemies.length - 1];
    expect(child.generation).toBe(2);
    
    // MaxHP should be 0.55 * 100 * (2 * 1.5) = 55 * 3 = 165
    expect(child.hp).toBeCloseTo(165);
  });

  it('Cauterize cancels a queued split; Fission Catalyst forces one; Overkill Spill passes excess damage to children.', () => {
    // Cauterize
    let sys = new MitosisSystem();
    let parent = sys.spawn('mitotic_rock', 0, 100, 0, 0, 10)!;
    parent.cauterizedTimer = 1; // active
    sys.handleDeath(parent, 0, false, false);
    expect(sys.enemies.length).toBe(0); // cancelled
    
    // Fission Catalyst
    sys = new MitosisSystem();
    parent = sys.spawn('mitotic_rock', 0, 60, 0, 0, 10)!;
    // HP is 60 (out of 100). Fission catalyst means children inherit remaining HP / numChildren.
    // numChildren = 2. Each gets 30.
    sys.handleDeath(parent, 0, true, true);
    expect(sys.enemies.length).toBe(2);
    expect(sys.enemies[0].hp).toBeCloseTo(30);
    expect(sys.enemies[1].hp).toBeCloseTo(30);
    
    // Overkill Spill
    sys = new MitosisSystem();
    parent = sys.spawn('mitotic_rock', 0, 100, 0, 0, 10)!;
    // Base hpShare = 0.55 * 100 = 55 each.
    // Overkill damage = 20. Split among 2 children = 10 each.
    // HP should be 45 each.
    sys.handleDeath(parent, 20, false, false);
    expect(sys.enemies.length).toBe(2);
    expect(sys.enemies[0].hp).toBeCloseTo(45);
    expect(sys.enemies[1].hp).toBeCloseTo(45);
  });
});
