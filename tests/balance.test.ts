import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config';

export function tierHP(t: number): number {
  return 12 * Math.pow(CONFIG.ECON.TIER_HP_GROWTH, t);
}

export function tierArmor(t: number): number {
  return 0.8 * tierHP(t);
}

export function tierReward(t: number): number {
  return 4 * Math.pow(CONFIG.ECON.TIER_REWARD_GROWTH, t);
}

export function bossHP(t: number): number {
  return tierHP(t) * 50; // Bosses are huge walls
}

export function requiredDPS(t: number): number {
  // A rough estimate: need to kill a standard enemy in ~0.5 seconds
  return tierHP(t) * 2;
}

describe('Balance Generator', () => {
  it('prints the balance spreadsheet for key tiers', () => {
    const tiers = [1, 10, 50, 100, 250, 500, 1000, 1900];
    
    console.log('--- BALANCE SPREADSHEET ---');
    console.log('Tier\tEnemy HP\tEnemy Armor\tBoss HP\t\tRequired DPS\tReward');
    
    for (const t of tiers) {
      const hp = tierHP(t);
      const armor = tierArmor(t);
      const boss = bossHP(t);
      const dps = requiredDPS(t);
      const reward = tierReward(t);
      
      console.log(`${t}\t${hp.toExponential(2)}\t${armor.toExponential(2)}\t${boss.toExponential(2)}\t${dps.toExponential(2)}\t${reward.toExponential(2)}`);
    }
    console.log('---------------------------');
    
    // Just a sanity check that tier 1900 numbers don't go to Infinity in JS
    expect(tierHP(1900)).toBeLessThan(Infinity);
  });
});
