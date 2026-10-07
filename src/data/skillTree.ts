export interface SkillNode {
  id: string;
  q: number; // Hex coordinate q
  r: number; // Hex coordinate r
  name: string;
  desc: string;
  cost: number;
  reqTiers: number; // tier progression marker
  unlocksBlock?: string;
  unlocksGridSpace?: number;
  keystone?: boolean;
}

export const SKILL_TREE: Record<string, SkillNode> = {
  start: { id: 'start', q: 0, r: 0, name: 'Core Optimization', desc: '+5% Damage', cost: 1, reqTiers: 0 },
  node1: { id: 'node1', q: 1, r: 0, name: 'Grid Expansion', desc: '+1 Grid space', cost: 2, reqTiers: 10, unlocksGridSpace: 1 },
  node2: { id: 'node2', q: 0, r: 1, name: 'Piercing Tech', desc: 'Unlocks Piercing block', cost: 3, reqTiers: 20, unlocksBlock: 'piercing' },
  node3: { id: 'node3', q: -1, r: 1, name: 'Mitosis Hunter', desc: '+15% damage to generation >= 2', cost: 5, reqTiers: 50 },
  node4: { id: 'node4', q: 2, r: -1, name: 'Rapid Fire', desc: '+10% Fire Rate', cost: 3, reqTiers: 30 },
  node5: { id: 'node5', q: 1, r: -2, name: 'Keystone: Blastoff', desc: 'Projectiles near the ship are blasted upward with 1.5x damage.', cost: 20, reqTiers: 100, keystone: true },
  node6: { id: 'node6', q: -2, r: 1, name: 'Bouncing Tech', desc: 'Unlocks Bouncing block', cost: 4, reqTiers: 60, unlocksBlock: 'bouncing' },
  node7: { id: 'node7', q: 3, r: 0, name: 'Grid Expansion II', desc: '+2 Grid space', cost: 8, reqTiers: 150, unlocksGridSpace: 2 },
  node8: { id: 'node8', q: 0, r: 3, name: 'Keystone: Overload', desc: 'Projectiles deal 3x damage but lose 50% speed.', cost: 30, reqTiers: 500, keystone: true },
  node9: { id: 'node9', q: 4, r: 0, name: 'Ascension', desc: '+100% Currency Drops', cost: 50, reqTiers: 1000 }
};
