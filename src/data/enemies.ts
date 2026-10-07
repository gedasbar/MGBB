export type MoveBehavior = 'drift' | 'sine' | 'seek' | 'orbit' | 'skitter' | 'anchor' | 'chase-edge';

export interface SplitRule {
  trigger: 'onDeath' | 'onHitThreshold' | 'onTimer' | 'onHitEvery';
  children: number | [number, number];
  childDefId: string;
  hpShare: number;
  shape: 'binary' | 'triple' | 'radial' | 'bud' | 'cluster';
}

export interface EnemyDef {
  id: string;
  name: string;
  tierMin: number;
  weight: number;
  size: 'XS'|'S'|'M'|'L'|'XL';
  hpMul: number;
  armorMul: number;
  shieldMul: number;
  move: MoveBehavior;
  split?: SplitRule;
  traits: string[];
  reward: number;
  contactDamage: number;
  palette: [string, string, string];
}

export const ENEMIES: Record<string, EnemyDef> = {
  mitotic_rock: {
    id: 'mitotic_rock', name: 'Mitotic Rock', tierMin: 1, weight: 10,
    size: 'M', hpMul: 1, armorMul: 0, shieldMul: 0,
    move: 'drift',
    split: {
      trigger: 'onDeath', children: 2, childDefId: 'mitotic_rock', hpShare: 0.55, shape: 'binary'
    },
    traits: [], reward: 1, contactDamage: 10, palette: ['#888888', '#555555', '#333333']
  },
  spore_mother: {
    id: 'spore_mother', name: 'Spore Mother', tierMin: 5, weight: 5,
    size: 'L', hpMul: 3, armorMul: 0, shieldMul: 1,
    move: 'seek',
    split: {
      trigger: 'onHitEvery', children: 3, childDefId: 'mitotic_rock', hpShare: 0.1, shape: 'cluster'
    },
    traits: [], reward: 3, contactDamage: 25, palette: ['#00ff00', '#00aa00', '#005500']
  },
  hydra_boulder: {
    id: 'hydra_boulder', name: 'Hydra Boulder', tierMin: 10, weight: 5,
    size: 'L', hpMul: 2, armorMul: 2, shieldMul: 0,
    move: 'anchor',
    split: {
      trigger: 'onDeath', children: 3, childDefId: 'hydra_boulder', hpShare: 0.4, shape: 'triple'
    },
    traits: [], reward: 4, contactDamage: 30, palette: ['#0000ff', '#0000aa', '#000055']
  },
  crystal_geode: {
    id: 'crystal_geode', name: 'Crystal Geode', tierMin: 1, weight: 8,
    size: 'S', hpMul: 0.8, armorMul: 0, shieldMul: 3,
    move: 'orbit',
    split: {
      trigger: 'onDeath', children: [3, 5], childDefId: 'mitotic_rock', hpShare: 0.2, shape: 'radial'
    },
    traits: [], reward: 2, contactDamage: 5, palette: ['#ff00ff', '#aa00aa', '#550055']
  },
  hive_mind: {
    id: 'hive_mind', name: 'Hive Mind', tierMin: 20, weight: 3,
    size: 'XL', hpMul: 5, armorMul: 0, shieldMul: 2,
    move: 'drift',
    split: {
      trigger: 'onTimer', children: 1, childDefId: 'spore_mother', hpShare: 0.2, shape: 'bud'
    },
    traits: [], reward: 10, contactDamage: 50, palette: ['#ffff00', '#aaaa00', '#555500']
  },
  obsidian_shard: {
    id: 'obsidian_shard', name: 'Obsidian Shard', tierMin: 5, weight: 6,
    size: 'XS', hpMul: 0.5, armorMul: 5, shieldMul: 0,
    move: 'seek',
    traits: [], reward: 1, contactDamage: 15, palette: ['#333333', '#111111', '#000000']
  },
  plasma_jelly: {
    id: 'plasma_jelly', name: 'Plasma Jelly', tierMin: 15, weight: 4,
    size: 'M', hpMul: 1.5, armorMul: 0, shieldMul: 5,
    move: 'sine',
    split: {
      trigger: 'onDeath', children: 2, childDefId: 'plasma_jelly', hpShare: 0.5, shape: 'binary'
    },
    traits: [], reward: 3, contactDamage: 20, palette: ['#00ffff', '#00aaaa', '#005555']
  },
  titan_core: {
    id: 'titan_core', name: 'Titan Core', tierMin: 25, weight: 2,
    size: 'L', hpMul: 4, armorMul: 3, shieldMul: 3,
    move: 'anchor',
    split: {
      trigger: 'onHitThreshold', children: 4, childDefId: 'obsidian_shard', hpShare: 0.15, shape: 'radial'
    },
    traits: [], reward: 8, contactDamage: 40, palette: ['#ff8800', '#aa5500', '#552200']
  },
  neon_striker: {
    id: 'neon_striker', name: 'Neon Striker', tierMin: 12, weight: 6,
    size: 'S', hpMul: 0.6, armorMul: 0, shieldMul: 1,
    move: 'seek',
    traits: ['fast'], reward: 2, contactDamage: 15, palette: ['#00ff88', '#00aa55', '#005522']
  },
  fractal_prism: {
    id: 'fractal_prism', name: 'Fractal Prism', tierMin: 30, weight: 1,
    size: 'M', hpMul: 2.5, armorMul: 1, shieldMul: 8,
    move: 'orbit',
    split: {
      trigger: 'onDeath', children: [2, 3], childDefId: 'crystal_geode', hpShare: 0.25, shape: 'radial'
    },
    traits: [], reward: 6, contactDamage: 25, palette: ['#ffffff', '#aaaaaa', '#555555']
  },
  void_weaver: {
    id: 'void_weaver', name: 'Void Weaver', tierMin: 18, weight: 4,
    size: 'M', hpMul: 2, armorMul: 0, shieldMul: 0,
    move: 'sine',
    traits: ['stealth'], reward: 4, contactDamage: 18, palette: ['#440088', '#220044', '#110022']
  },
  magma_slug: {
    id: 'magma_slug', name: 'Magma Slug', tierMin: 8, weight: 5,
    size: 'M', hpMul: 1.8, armorMul: 4, shieldMul: 0,
    move: 'drift',
    split: {
      trigger: 'onHitThreshold', children: 2, childDefId: 'magma_slug', hpShare: 0.4, shape: 'binary'
    },
    traits: ['fire'], reward: 3, contactDamage: 30, palette: ['#ff4400', '#aa2200', '#551100']
  }
};
