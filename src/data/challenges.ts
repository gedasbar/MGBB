// Chunk 28a: the challenges (docs/achievements.md). Plain data you can edit by hand. A challenge is a campaign tier flown with a RULE.
// It opens when the player has passed its tier; starting it opens the builder with the rule shown, FLY is blocked while the circuit or
// hull breaks a build rule, and the in-run rules (no firing, a time limit) are enforced while flying. The reward is paid once.
//
// Rules (all optional, all must hold):
//   hulls        the hull must be one of these (hull ids from src/data/hulls.ts)
//   banBlocks    none of these block ids may be on the circuit
//   banCategory  no block of these categories (e.g. 'legendary')
//   needBlocks   every one of these block ids must be on the circuit
//   maxBlocks    at most this many placed blocks
//   maxEjectors  at most this many ejectors fire (an ejector no signal reaches does not count)
//   noFire       in the run: the ship cannot fire (use it with goal 'pass')
//   timeLimit    in the run: the goal must be met within this many seconds
// goal: 'clear' = destroy every block, 'pass' = clear or fly past the end.

import type { BlockCategory } from '../engine/compilerTypes';
import type { Cosmetic } from './achievements';

export interface ChallengeRules {
  hulls?: string[];
  banBlocks?: string[];
  banCategory?: BlockCategory[];
  needBlocks?: string[];
  maxBlocks?: number;
  maxEjectors?: number;
  noFire?: boolean;
  timeLimit?: number;
}

export interface ChallengeDef {
  id: string;
  name: string;
  tier: number;
  goal: 'clear' | 'pass';
  rules: ChallengeRules;
  reward: { medals: number } | { cosmetic: Cosmetic };
}

/** Block families used by the rules below (ids from src/data/blocks.ts). */
export const AOE_BLOCKS = ['aoe_circle', 'aoe_rect'];
export const SPLITTER_BLOCKS = ['splitter_2', 'splitter_3'];

const m = (medals: number) => ({ medals });
const skin = (id: string, name: string) => ({ cosmetic: { id, kind: 'skin' as const, name } });
const trail = (id: string, name: string) => ({ cosmetic: { id, kind: 'trail' as const, name } });

export const CHALLENGES: readonly ChallengeDef[] = [
  // ---- One for every hull, price order (so every ship has a challenge), most with a second rule
  { id: 'c_dart', name: 'Small but mighty', tier: 10, goal: 'clear', rules: { hulls: ['dart'] }, reward: m(1) },
  { id: 'c_twin', name: 'Double trouble', tier: 16, goal: 'clear', rules: { hulls: ['twin'] }, reward: m(1) },
  { id: 'c_prong', name: 'Prong power', tier: 30, goal: 'clear', rules: { hulls: ['prong'] }, reward: m(2) },
  { id: 'c_wisp', name: 'Light touch', tier: 22, goal: 'clear', rules: { hulls: ['wisp'], maxBlocks: 6 }, reward: m(2) },
  { id: 'c_hornet', name: 'Straight lines', tier: 28, goal: 'clear', rules: { hulls: ['hornet'], banBlocks: SPLITTER_BLOCKS }, reward: m(2) },
  { id: 'c_lancet', name: 'No easy pluses', tier: 34, goal: 'clear', rules: { hulls: ['lancet'], banBlocks: ['flat_plus'] }, reward: m(2) },
  { id: 'c_kestrel', name: 'One barrel', tier: 38, goal: 'clear', rules: { hulls: ['kestrel'], maxEjectors: 1 }, reward: m(2) },
  { id: 'c_bastion', name: 'No multipliers', tier: 42, goal: 'clear', rules: { hulls: ['bastion'], banBlocks: ['percent_mult'] }, reward: m(3) },
  { id: 'c_corvette', name: 'No blasts', tier: 50, goal: 'clear', rules: { hulls: ['corvette'], banBlocks: AOE_BLOCKS }, reward: m(3) },
  { id: 'c_halberd', name: 'Straight through', tier: 55, goal: 'clear', rules: { hulls: ['halberd'], needBlocks: ['piercing'] }, reward: m(3) },
  { id: 'c_trident', name: 'Trident, plain', tier: 62, goal: 'clear', rules: { hulls: ['trident'], banCategory: ['legendary'] }, reward: m(3) },
  { id: 'c_mantis', name: 'Mantis, pure', tier: 67, goal: 'clear', rules: { hulls: ['mantis'], banCategory: ['legendary'] }, reward: m(3) },
  { id: 'c_galleon', name: 'Seeker fleet', tier: 72, goal: 'clear', rules: { hulls: ['galleon'], needBlocks: ['homing'] }, reward: m(4) },
  { id: 'c_shuttle', name: 'Lean shuttle', tier: 78, goal: 'clear', rules: { hulls: ['shuttle'], maxBlocks: 20 }, reward: m(4) },
  { id: 'c_spire', name: 'Spire, no frills', tier: 88, goal: 'clear', rules: { hulls: ['spire'], banBlocks: ['flat_plus', 'percent_mult'] }, reward: m(4) },
  { id: 'c_leviathan', name: 'Leviathan, one lane', tier: 98, goal: 'clear', rules: { hulls: ['leviathan'], maxEjectors: 1 }, reward: m(5) },
  { id: 'c_fan', name: 'Fan of fire', tier: 112, goal: 'clear', rules: { hulls: ['fan'], banBlocks: AOE_BLOCKS }, reward: m(5) },
  { id: 'c_citadel', name: 'Citadel, by hand', tier: 130, goal: 'clear', rules: { hulls: ['citadel'], banCategory: ['legendary'] }, reward: m(6) },
  { id: 'c_zenith', name: 'Zenith alone', tier: 150, goal: 'clear', rules: { hulls: ['zenith'], maxBlocks: 40 }, reward: skin('skin_zenith', 'Zenith projectile skin') },
  // ---- Rules on any hull
  { id: 'c_no_aoe', name: 'No explosions', tier: 45, goal: 'clear', rules: { banBlocks: AOE_BLOCKS }, reward: m(3) },
  { id: 'c_one_ejector', name: 'One gun only', tier: 60, goal: 'clear', rules: { maxEjectors: 1 }, reward: m(3) },
  { id: 'c_12_blocks', name: 'Twelve blocks', tier: 80, goal: 'clear', rules: { maxBlocks: 12 }, reward: m(4) },
  { id: 'c_no_legend', name: 'No legends', tier: 90, goal: 'clear', rules: { banCategory: ['legendary'] }, reward: m(4) },
  { id: 'c_chain', name: 'Chain reaction', tier: 75, goal: 'clear', rules: { needBlocks: ['chain_lightning'] }, reward: m(3) },
  { id: 'c_ignite', name: 'Burn it down', tier: 52, goal: 'clear', rules: { needBlocks: ['ignite'], banBlocks: AOE_BLOCKS }, reward: m(3) },
  { id: 'c_orbit', name: 'In orbit', tier: 65, goal: 'clear', rules: { needBlocks: ['orbit'] }, reward: m(3) },
  { id: 'c_fast_25', name: 'Quick work', tier: 25, goal: 'clear', rules: { timeLimit: 35 }, reward: m(2) },
  { id: 'c_fast_40', name: 'Dash', tier: 40, goal: 'pass', rules: { timeLimit: 30 }, reward: m(3) },
  { id: 'c_maze_nofire', name: 'Pacifist', tier: 106, goal: 'pass', rules: { noFire: true }, reward: trail('trail_pacifist', 'White trail') },
  { id: 'c_wind', name: 'Against the wind', tier: 115, goal: 'clear', rules: { needBlocks: ['upturn'] }, reward: m(5) },
  { id: 'c_fortress', name: 'Siege', tier: 142, goal: 'clear', rules: { banCategory: ['legendary'], maxEjectors: 2 }, reward: m(6) },
];

export const CHALLENGE_BY_ID: Record<string, ChallengeDef> = Object.fromEntries(CHALLENGES.map(c => [c.id, c]));
