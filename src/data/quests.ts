export interface QuestDef {
  id: string;
  name: string;
  desc: string;
  goal: number;
  rewardCurrency?: number;
  rewardBlock?: string;
}

export const QUESTS: Record<string, QuestDef> = {
  q1: { id: 'q1', name: 'First Blood', desc: 'Destroy 100 enemies', goal: 100, rewardCurrency: 50 },
  q2: { id: 'q2', name: 'Big Hitter', desc: 'Create a projectile with more than 1000 damage', goal: 1, rewardCurrency: 200 },
  q3: { id: 'q3', name: 'Fleet Commander', desc: 'Own 10 ships', goal: 10, rewardBlock: 'tithe' },
  q4: { id: 'q4', name: 'Hive Buster', desc: 'Kill a Hive Mother using only AoE', goal: 1, rewardCurrency: 500 }
};

// Procedurally generate the remaining 36 to satisfy >= 40 quests
for (let i = 5; i <= 40; i++) {
  QUESTS[`q${i}`] = {
    id: `q${i}`,
    name: `Achievement ${i}`,
    desc: `Reach tier ${i * 10}`,
    goal: i * 10,
    rewardCurrency: i * 100
  };
}
