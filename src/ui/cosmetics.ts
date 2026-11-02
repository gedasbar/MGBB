import { ACHIEVEMENTS } from '../data/achievements';
import { CHALLENGES } from '../data/challenges';
import { ALL_LOOKS, SHOT_LOOK_BANDS, ShotLook, SHOT_LOOKS } from './shotLook';
import { SKIN_AUTO, TRAIL_STYLE_DEFAULT } from './settings';

/**
 * Chunk 28b: the cosmetics of the Customization tab. Pure data and rules, no Pixi.
 *
 * PROJECTILE SKINS. "Auto" (the default) is today's behaviour: the shot's look follows its damage band. Or every shot in normal flight can be locked to one look the player
 * has unlocked. The five damage-band looks (`band0` .. `band4`) unlock when the player's BEST SHOT (`records.bestShot`) reaches that band's lowest damage (band 0 is always
 * open); the three reward skins unlock by the cosmetic id an achievement or challenge paid (28a). Orbit, Boomerang and Mine keep their own looks whatever is chosen.
 *
 * TRAIL STYLES. How the fading trail behind a shot is coloured: "Standard" is the shot's own colour; the three reward styles use their own colour ramps. The trail's length
 * (Off / Short / Long) is a Graphics setting.
 */

/** What the unlock rules read of the save. */
export interface CosmeticProgress { records: { bestShot: number }; cosmetics: readonly string[] }

export interface SkinDef {
  id: string;
  name: string;
  /** Index into ALL_LOOKS (0-4 the damage bands, 5-7 the reward skins). */
  look: number;
  /** Unlocked by reaching a damage band with the best shot (band = its index), or by owning a cosmetic id. */
  unlock: { band: number } | { cosmetic: string };
}

const BAND_NAMES = ['Cyan dash', 'Pale bar', 'Gold diamond', 'Orange bolt', 'Magenta star'];

export const SKINS: readonly SkinDef[] = [
  ...SHOT_LOOKS.map((_, i): SkinDef => ({ id: `band${i}`, name: BAND_NAMES[i], look: i, unlock: { band: i } })),
  { id: 'skin_legend', name: 'Legend hexagon', look: SHOT_LOOKS.length, unlock: { cosmetic: 'skin_legend' } },
  { id: 'skin_star', name: 'Star cross', look: SHOT_LOOKS.length + 1, unlock: { cosmetic: 'skin_star' } },
  { id: 'skin_zenith', name: 'Zenith arrowhead', look: SHOT_LOOKS.length + 2, unlock: { cosmetic: 'skin_zenith' } },
];

export interface TrailStyleDef {
  id: string;
  name: string;
  /** Colour of each segment from the shot backwards (the last repeats); null = the shot's own colour. */
  colors: readonly number[] | null;
  unlock: 'always' | { cosmetic: string };
}

export const TRAIL_STYLES: readonly TrailStyleDef[] = [
  { id: TRAIL_STYLE_DEFAULT, name: 'Standard', colors: null, unlock: 'always' },
  { id: 'trail_ember', name: 'Ember', colors: [0xffc04a, 0xff8a1e, 0xe0501a, 0xa03212, 0x6a2410], unlock: { cosmetic: 'trail_ember' } },
  { id: 'trail_ace', name: 'Ace', colors: [0xfff2a0, 0xffe14a, 0xe6b800, 0xb08a00, 0x7a6000], unlock: { cosmetic: 'trail_ace' } },
  { id: 'trail_pacifist', name: 'Pacifist', colors: [0xffffff, 0xe6e6e6, 0xc4c4c4, 0x9a9a9a, 0x707070], unlock: { cosmetic: 'trail_pacifist' } },
];

export function skinUnlocked(def: SkinDef, p: CosmeticProgress): boolean {
  if ('band' in def.unlock) return def.unlock.band <= 0 || p.records.bestShot >= SHOT_LOOK_BANDS[def.unlock.band - 1];
  return p.cosmetics.includes(def.unlock.cosmetic);
}

export function trailUnlocked(def: TrailStyleDef, p: CosmeticProgress): boolean {
  return def.unlock === 'always' || p.cosmetics.includes(def.unlock.cosmetic);
}

/** Where an item comes from, for the locked tile's line: the damage a hit must reach, or the achievement / challenge that pays it. */
export function unlockHint(unlock: SkinDef['unlock'] | TrailStyleDef['unlock'], fmt: (n: number) => string = String): string {
  if (unlock === 'always') return '';
  if ('band' in unlock) return `Land a hit of ${fmt(SHOT_LOOK_BANDS[unlock.band - 1])}`;
  const a = ACHIEVEMENTS.find(x => 'cosmetic' in x.reward && x.reward.cosmetic.id === unlock.cosmetic);
  if (a) return `Achievement: ${a.name}`;
  const c = CHALLENGES.find(x => 'cosmetic' in x.reward && x.reward.cosmetic.id === unlock.cosmetic);
  return c ? `Challenge: ${c.name}` : 'Reward';
}

/** The skin a run uses: the chosen one if it exists and is unlocked, else null (= Auto, the look follows damage). A stale id (an imported save) falls back to Auto. */
export function resolveSkin(id: string, p: CosmeticProgress): SkinDef | null {
  if (id === SKIN_AUTO) return null;
  const def = SKINS.find(s => s.id === id);
  return def && skinUnlocked(def, p) ? def : null;
}

/** The trail style a run uses: the chosen one if unlocked, else Standard. */
export function resolveTrailStyle(id: string, p: CosmeticProgress): TrailStyleDef {
  const def = TRAIL_STYLES.find(s => s.id === id);
  return def && trailUnlocked(def, p) ? def : TRAIL_STYLES[0];
}

export const skinLook = (def: SkinDef): ShotLook => ALL_LOOKS[def.look];

/** What a fly screen needs from the player's choices, resolved against what is unlocked. */
export function cosmeticsFor(p: CosmeticProgress, skinId: string, trailId: string): { skinLook: number | null; trailColors: readonly number[] | null } {
  const skin = resolveSkin(skinId, p);
  return { skinLook: skin ? skin.look : null, trailColors: resolveTrailStyle(trailId, p).colors };
}
