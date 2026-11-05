import { specialKind } from './waves';
import { coresForWave } from '../shipyard/cores';

/**
 * Wave themes (chunk 32a, docs/freefly-v2.md section 3): about every third Free Fly wave from wave 9 on is themed.
 * Data only; `planWave` (game/waves.ts) reads the numbers, the Fly screen the names and lines.
 */
export type ThemeId = 'armored' | 'swarm' | 'gunners' | 'shield_wall' | 'leeches';

export interface ThemeDef {
  id: ThemeId;
  /** Banner name and its one line. */
  name: string;
  line: string;
  /** Multiplier on the wave's spawn budget. */
  budgetMul: number;
}

/** The table, in the order the themes start (and repeat). */
export const THEMES: readonly ThemeDef[] = [
  { id: 'armored', name: 'ARMORED', line: 'Most enemies wear armor', budgetMul: 1 },
  { id: 'swarm', name: 'SWARM', line: 'Many tiny fast rocks', budgetMul: 1.1 },
  { id: 'gunners', name: 'GUNNERS', line: 'Dodge the bullets', budgetMul: 1 },
  { id: 'shield_wall', name: 'SHIELD WALL', line: 'Kill the Shielders first', budgetMul: 1 },
  { id: 'leeches', name: 'LEECHES', line: 'They heal what is near', budgetMul: 1 },
];
export const THEME_BY_ID: Record<ThemeId, ThemeDef> = Object.fromEntries(THEMES.map(t => [t.id, t])) as Record<ThemeId, ThemeDef>;

/** First themed wave and the spacing of eligible waves. */
export const THEME_FIRST_WAVE = 9;
export const THEME_EVERY = 3;
/** Armored theme: share of bodies that are armored, and the armor they get (the Ironclad's). */
export const ARMORED_SHARE = 0.7;
export const ARMORED_ARMOR = 10;
/** Swarm theme: share of the budget spent on Darters (the rest on pebbles). */
export const SWARM_DARTER_SHARE = 0.4;
/** Gunners / Leeches themes: share of the budget spent on the themed enemy. */
export const GUNNER_THEME_SHARE = 0.6;
export const LEECH_THEME_SHARE = 0.4;
/** Shield wall: escorts born with each Shielder, and how far from it (px, +-). */
export const SHIELD_WALL_ESCORTS = 3;
export const SHIELD_WALL_SPREAD = 60;
/** Cores bonus of a theme wave: this share of the Cores the wave's start pays (at least 1), times the Core Magnet. */
export const THEME_CORES_SHARE = 0.5;

/** Whether `wave` may be themed: from THEME_FIRST_WAVE, every THEME_EVERY, never a Swarm / Mother wave (multiples of 5, which also covers the boss waves 10, 20 ...). */
export const themeEligible = (wave: number) => wave >= THEME_FIRST_WAVE && wave % THEME_EVERY === 0 && specialKind(wave) === null;

/** The theme of a wave, or null. The n-th eligible wave takes the n-th table entry, repeating. */
export function themeAt(wave: number): ThemeDef | null {
  if (!themeEligible(wave)) return null;
  let n = 0;
  for (let w = THEME_FIRST_WAVE; w < wave; w++) if (themeEligible(w)) n++;
  return THEMES[n % THEMES.length];
}

/** Cores a theme wave pays on top (before the Core Magnet); 0 for a plain wave. */
export const themeCores = (wave: number) => (themeAt(wave) ? Math.max(1, Math.round(coresForWave(wave) * THEME_CORES_SHARE)) : 0);
