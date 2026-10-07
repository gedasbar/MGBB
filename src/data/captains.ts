export interface CaptainDef {
  id: string;
  name: string;
  passiveDesc: string;
  activeDesc: string;
}

export const CAPTAINS: Record<string, CaptainDef> = {
  venus: { id: 'venus', name: 'Venus', passiveDesc: '+1 damage for every 5 tiers cleared.', activeDesc: 'Heal hull by 25%.' },
  mars: { id: 'mars', name: 'Mars', passiveDesc: '+2% damage per rank.', activeDesc: 'Enrage: +50% fire rate for 10s.' },
  jupiter: { id: 'jupiter', name: 'Jupiter', passiveDesc: '+5% currency per rank.', activeDesc: 'Summon a treasure asteroid.' },
  saturn: { id: 'saturn', name: 'Saturn', passiveDesc: 'Rings: project an orbital shield.', activeDesc: 'Invulnerability for 5s.' },
  neptune: { id: 'neptune', name: 'Neptune', passiveDesc: 'Water cooling: +5% fire rate.', activeDesc: 'Freeze all enemies for 3s.' },
  pluto: { id: 'pluto', name: 'Pluto', passiveDesc: '+10% damage vs bosses.', activeDesc: 'Culling Strike: instantly kill non-bosses under 30% HP.' },
  apollo: { id: 'apollo', name: 'Apollo', passiveDesc: '+2 projectile speed.', activeDesc: 'Solar Flare: huge AoE damage.' },
  nova: { id: 'nova', name: 'Nova', passiveDesc: 'Combo meter decays 50% slower.', activeDesc: 'Clear all enemy projectiles.' }
};
