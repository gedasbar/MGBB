import { describe, it, expect } from 'vitest';
import { BossRuntime } from '../src/engine/boss';

describe('Bosses', () => {
  it('Core takes reduced damage until its plate/turret parts are destroyed.', () => {
    const boss = new BossRuntime('crusher_wall');
    
    // Attack the core directly while plates are alive
    const initialCoreHp = boss.parts.find(p => p.id === 'core')!.hp;
    
    // Deal 1000 damage. Since it's pure damage (pureFrac=1), it bypasses shield and armor.
    boss.hitPart('core', 1000, 1.0, 1, false, false);
    
    // Core should only take 10% of 1000 = 100 damage.
    const coreHpAfterReduced = boss.parts.find(p => p.id === 'core')!.hp;
    expect(coreHpAfterReduced).toBe(initialCoreHp - 100);
    
    // Now destroy all plates
    boss.hitPart('plate1', 5000, 1.0, 1, false, false);
    boss.hitPart('plate2', 5000, 1.0, 1, false, false);
    boss.hitPart('plate3', 5000, 1.0, 1, false, false);
    boss.hitPart('plate4', 5000, 1.0, 1, false, false);
    
    // Core is now exposed. 
    // Deal 1000 damage.
    boss.hitPart('core', 1000, 1.0, 1, false, false);
    
    const coreHpAfterFull = boss.parts.find(p => p.id === 'core')!.hp;
    expect(coreHpAfterFull).toBe(coreHpAfterReduced - 1000);
  });

  it('The danger-line reaching the bottom ends the run.', () => {
    const boss = new BossRuntime('crusher_wall', 0); // starts at y=0
    boss.dangerLineY = 800;
    
    // Speed is 5 px/s. Enrage at 60s.
    // 60s * 5 = 300px.
    for (let i = 0; i < 60; i++) {
      boss.update(1);
    }
    expect(boss.y).toBe(300);
    expect(boss.reachedDangerLine()).toBe(false);
    
    // Enraged speed is 10 px/s. Need 500px to reach 800.
    // 50s * 10 = 500px.
    for (let i = 0; i < 50; i++) {
      boss.update(1);
    }
    expect(boss.y).toBe(800);
    expect(boss.reachedDangerLine()).toBe(true);
  });
});
