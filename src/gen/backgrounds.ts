export interface BiomeDef {
  id: string;
  name: string;
  colorPrimary: string;
  colorSecondary: string;
  starDensity: number;
  nebulaAlpha: number;
}

export const BIOMES: Record<string, BiomeDef> = {
  void_expanse: { id: 'void_expanse', name: 'Void Expanse', colorPrimary: '#111122', colorSecondary: '#000011', starDensity: 0.8, nebulaAlpha: 0.1 },
  toxic_nebula: { id: 'toxic_nebula', name: 'Toxic Nebula', colorPrimary: '#224422', colorSecondary: '#112211', starDensity: 0.3, nebulaAlpha: 0.6 },
  crimson_rift: { id: 'crimson_rift', name: 'Crimson Rift', colorPrimary: '#551111', colorSecondary: '#330000', starDensity: 0.5, nebulaAlpha: 0.4 },
  crystalline_belt: { id: 'crystalline_belt', name: 'Crystalline Belt', colorPrimary: '#221155', colorSecondary: '#110033', starDensity: 1.0, nebulaAlpha: 0.2 },
  golden_cloud: { id: 'golden_cloud', name: 'Golden Cloud', colorPrimary: '#554411', colorSecondary: '#332200', starDensity: 0.4, nebulaAlpha: 0.7 }
};

export function getBiomeForTier(tier: number): BiomeDef {
  // Rotate biomes every 100 tiers
  const index = Math.floor(tier / 100) % Object.keys(BIOMES).length;
  const key = Object.keys(BIOMES)[index];
  return BIOMES[key];
}
