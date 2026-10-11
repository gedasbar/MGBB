/**
 * Free Fly enemy species (chunk 10a): how each one moves, what it is worth and when the wave director may send it.
 * The split side (children, HP share, armor, shield) is in data/enemies.ts; the look is in ui/rockArt.ts. All three are
 * keyed by the same id. See docs/freefly-design.md for the design table.
 */
export interface SpeciesDef {
  id: string;
  name: string;
  /** Radius in px of a body spawned by the director (children take their split rule's radius). */
  radius: number;
  /** HP as a multiple of the basic rock's HP at the tier (rockHp). */
  hpMul: number;
  /** Fall speed in px/s. */
  speed: number;
  /** Sine sway amplitude in px/s (the basic rock's 30). */
  sway: number;
  /** Constant sideways speed in px/s; the sign flips at each screen side (Drifter). */
  zig: number;
  /** Dives at where the ship was when it spawned: max sideways speed in px/s (0 = does not aim). */
  aim: number;
  /** Multiplier on the size-by-generation leak damage. */
  leakMul: number;
  /** Multiplier on rockReward(tier, generation) for each body of this species. */
  rewardMul: number;
  /** Wave-director point cost (a basic Rock = 4) and weight; 0 = never drawn on its own (children, special waves). */
  cost: number;
  weight: number;
  /** First wave it may appear in (Infinity = only as a child). */
  firstWave: number;
  /** Budding: a new small rock every `every` s while alive and on screen, up to `max`, at `hpShare` of its max HP. */
  bud?: { every: number; max: number; hpShare: number; generation: number; radius: number };
}

const base = { sway: 0, zig: 0, aim: 0, leakMul: 1, rewardMul: 1, cost: 0, weight: 0, firstWave: Infinity };

export const SPECIES: Record<string, SpeciesDef> = {
  // The basic rock: numbers as before chunk 10a (ENEMY_SPEED, the 30 px/s sway, ROCK_RADIUS).
  mitotic_rock: { ...base, id: 'mitotic_rock', name: 'Rock', radius: 20, hpMul: 1, speed: 40, sway: 30, cost: 4, weight: 10, firstWave: 1 },
  darter: { ...base, id: 'darter', name: 'Darter', radius: 11, hpMul: 0.35, speed: 150, aim: 70, leakMul: 0.34, rewardMul: 0.3, cost: 1, weight: 6, firstWave: 2 },
  drifter: { ...base, id: 'drifter', name: 'Drifter', radius: 18, hpMul: 0.8, speed: 26, zig: 110, rewardMul: 0.6, cost: 2, weight: 5, firstWave: 3 },
  mother: { ...base, id: 'mother', name: 'Mother', radius: 34, hpMul: 3, speed: 20, sway: 12, leakMul: 1.33, rewardMul: 2, cost: 9, weight: 2, firstWave: 4 },
  brood: { ...base, id: 'brood', name: 'Brood', radius: 20, hpMul: 1.2, speed: 34, sway: 24, rewardMul: 2 },
  ironclad: { ...base, id: 'ironclad', name: 'Ironclad', radius: 23, hpMul: 1.2, speed: 32, sway: 18, rewardMul: 2, cost: 6, weight: 4, firstWave: 6 },
  warden: { ...base, id: 'warden', name: 'Warden', radius: 21, hpMul: 1, speed: 36, sway: 30, rewardMul: 1.2, cost: 3, weight: 4, firstWave: 7 },
  budder: {
    ...base, id: 'budder', name: 'Budder', radius: 26, hpMul: 1.5, speed: 18, sway: 20, rewardMul: 0.8, cost: 4, weight: 3, firstWave: 8,
    bud: { every: 3.5, max: 3, hpShare: 0.25, generation: 3, radius: 15 },
  },
};

/** The species a body moves and pays as (unknown ids act as the basic rock). */
export const speciesOf = (defId: string): SpeciesDef => SPECIES[defId] ?? SPECIES.mitotic_rock;

/** The species the director can draw, in roster order. */
export const ROSTER = Object.values(SPECIES).filter(s => s.firstWave < Infinity);
