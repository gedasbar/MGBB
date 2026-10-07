export interface HullDef {
  id: string;
  name: string;
  space: number;
  firerate: number;
  projSpeed: number;
  traitDesc: string;
  cost: number; // in Core Shards
}

export const HULLS: Record<string, HullDef> = {
  basic_hull: { id: 'basic_hull', name: 'Scout', space: 25, firerate: 3, projSpeed: 1, traitDesc: 'Basic starter ship.', cost: 0 },
  heavy_cruiser: { id: 'heavy_cruiser', name: 'Heavy Cruiser', space: 45, firerate: 2.5, projSpeed: 0.8, traitDesc: '+20% Base Hull Integrity', cost: 10 },
  interceptor: { id: 'interceptor', name: 'Interceptor', space: 35, firerate: 5, projSpeed: 1.5, traitDesc: 'Projectiles fly 50% faster.', cost: 15 },
  carrier: { id: 'carrier', name: 'Carrier', space: 60, firerate: 2, projSpeed: 1, traitDesc: 'Generates 1 drone per 5 seconds.', cost: 30 },
  sniper: { id: 'sniper', name: 'Sniper', space: 30, firerate: 1.5, projSpeed: 2, traitDesc: '+50% flat damage.', cost: 20 },
  mitosis_breaker: { id: 'mitosis_breaker', name: 'Mitosis Breaker', space: 40, firerate: 3.5, projSpeed: 1.1, traitDesc: '+25% damage to generation >= 1.', cost: 25 },
  shield_bearer: { id: 'shield_bearer', name: 'Shield Bearer', space: 38, firerate: 2.8, projSpeed: 0.9, traitDesc: 'Has a built-in energy shield.', cost: 25 },
  gambler: { id: 'gambler', name: 'Gambler', space: 42, firerate: 4, projSpeed: 1, traitDesc: '10% chance to double output damage.', cost: 40 },
  warp_skiff: { id: 'warp_skiff', name: 'Warp Skiff', space: 32, firerate: 6, projSpeed: 1.2, traitDesc: 'Immune to hazard contact damage.', cost: 50 },
  dreadnought: { id: 'dreadnought', name: 'Dreadnought', space: 80, firerate: 1.2, projSpeed: 0.7, traitDesc: 'Massive grid space, slow fire rate.', cost: 100 }
};
