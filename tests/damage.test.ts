import { describe, it, expect } from 'vitest';
import { applyDamage, EnemyStats, armorScale } from '../src/engine/damage';
import { rng } from '../src/rng';

describe('Damage & combat', () => {
  it('Pure fraction bypasses shield and armor exactly as the formula states', () => {
    const enemy: EnemyStats = {
      hp: 100, maxHp: 100,
      armor: armorScale(1) * 9, // 90% reduction
      shield: 100, maxShield: 100
    };
    
    // 100 damage, 100% pure
    const res1 = applyDamage(enemy, 100, 1.0, 1);
    expect(res1.hpDamage).toBe(100);
    expect(res1.shieldDamage).toBe(0);
    expect(enemy.hp).toBe(0);
    
    const enemy2: EnemyStats = {
      hp: 100, maxHp: 100,
      armor: armorScale(1) * 9, // 90% reduction
      shield: 100, maxShield: 100
    };
    
    // 100 damage, 50% pure
    // 50 pure bypasses.
    // 50 direct hits shield. Shield goes 100 -> 50.
    const res2 = applyDamage(enemy2, 100, 0.5, 1);
    expect(res2.hpDamage).toBe(50);
    expect(res2.shieldDamage).toBe(50);
    expect(enemy2.hp).toBe(50);
    expect(enemy2.shield).toBe(50);
    
    // 100 damage, 0% pure. 
    // Shield is 50. 50 direct hits shield, 50 direct left.
    // 50 direct hits armor (90% reduction) -> 5 damage.
    const res3 = applyDamage(enemy2, 100, 0.0, 1);
    expect(res3.shieldDamage).toBe(50);
    expect(res3.hpDamage).toBeCloseTo(5);
    expect(enemy2.hp).toBeCloseTo(45);
  });
  
  it('Probability gates over 100k rolls land within ±1 % of expected frequency (seeded)', () => {
    rng.reset(999);
    let count20 = 0;
    const rolls = 100000;
    for(let i=0; i<rolls; i++) {
      if(rng.combat.next() < 0.2) count20++;
    }
    const freq = count20 / rolls;
    expect(freq).toBeGreaterThan(0.19);
    expect(freq).toBeLessThan(0.21);
  });
});
