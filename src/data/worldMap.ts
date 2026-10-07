export interface MapNode {
  id: string;
  tier: number;
  x: number;
  y: number;
  healthMul: number;
  armorMul: number;
  shieldMul: number;
  mutationChance: number;
  type: 'standard' | 'elite' | 'boss' | 'treasure' | 'hazard';
  cleared: boolean;
  edges: string[]; // IDs of connected nodes
}

export function generateWorldMap(_seed: number, maxTiers: number = 100): Record<string, MapNode> {
  const nodes: Record<string, MapNode> = {};
  
  // Very basic sequential generation for demonstration
  for (let i = 1; i <= maxTiers; i++) {
    const isBoss = i % 10 === 0;
    const isElite = !isBoss && i % 4 === 0;
    const isTreasure = i % 15 === 0;
    
    let type: MapNode['type'] = 'standard';
    if (isBoss) type = 'boss';
    else if (isTreasure) type = 'treasure';
    else if (isElite) type = 'elite';
    
    nodes[`node_${i}`] = {
      id: `node_${i}`,
      tier: i,
      x: i * 50,
      y: (Math.sin(i) * 100) + 200,
      healthMul: 1.0 + (i * 0.05),
      armorMul: 1.0 + (i * 0.05),
      shieldMul: 1.0 + (i * 0.05),
      mutationChance: i * 0.5,
      type,
      cleared: i === 1,
      edges: i < maxTiers ? [`node_${i + 1}`] : []
    };
  }
  
  return nodes;
}
