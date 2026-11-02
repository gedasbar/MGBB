/**
 * Shot looks by damage (chunk 21a, redrawn in 21b): a shot's drawing changes with its damage, in log bands, and every band has its own
 * SHAPE and COLOUR so the step reads at a glance and at small size. Flat and geometric (art language), no glow.
 *
 *   under 10     a thin cyan dash
 *   10 - 99      a longer pale-cyan bar
 *   100 - 999    a yellow diamond
 *   1K - 9.9K    an orange bolt (a pointed hexagon)
 *   10K and up   a magenta four-pointed star
 *
 * Boomerang, Orbit and Mine shots keep their own look (`PLAIN_LOOK` with their own tint), so `shotLookFor` is only used for a shot in plain
 * flight. Pure data and two functions; the sprites are managed by `ui/shotSprites.ts`.
 */

/** Lowest damage of bands 1, 2, 3 and 4: under 10, 10-99, 100-999, 1K-9.9K, 10K and up. */
export const SHOT_LOOK_BANDS: readonly number[] = [10, 100, 1000, 10000];

export type ShotShape = 'bar' | 'diamond' | 'bolt' | 'star' | 'hex' | 'cross' | 'chevron';

export interface ShotLook {
  /** Sprite width and height in px at size 1 (a Fork copy's smaller size scales both). */
  w: number;
  h: number;
  shape: ShotShape;
  /** Fill colour (the shape textures are white and tinted with it). */
  color: number;
}

export const SHOT_LOOKS: readonly ShotLook[] = [
  { w: 4, h: 14, shape: 'bar', color: 0x00ffff },
  { w: 6, h: 24, shape: 'bar', color: 0xb8f0ff },
  { w: 14, h: 22, shape: 'diamond', color: 0xffe14a },
  { w: 12, h: 32, shape: 'bolt', color: 0xff8a1e },
  { w: 26, h: 26, shape: 'star', color: 0xff30d8 },
];

/**
 * Chunk 28b: the three looks that are achievement rewards (cosmetic ids from 28a), each with its own flat shape and colour. A player can lock every shot of normal flight
 * to one of them (Build > ship button > Customization). Their index in ALL_LOOKS follows the five damage bands.
 */
export const SKIN_LOOKS: readonly ShotLook[] = [
  { w: 16, h: 22, shape: 'hex', color: 0xb6f23a },     // skin_legend: a lime hexagon
  { w: 22, h: 22, shape: 'cross', color: 0xfff6b0 },   // skin_star: a pale-gold plus
  { w: 16, h: 24, shape: 'chevron', color: 0x9a8cff }, // skin_zenith: a violet arrowhead
];

/** The five damage-band looks, then the three skins: the look ids the sprites and the Customization tab share. */
export const ALL_LOOKS: readonly ShotLook[] = [...SHOT_LOOKS, ...SKIN_LOOKS];

/** The plain bar of the Orbit, Boomerang and Mine phases (its colour is set by the phase). */
export const PLAIN_LOOK: ShotLook = { w: 6, h: 14, shape: 'bar', color: 0x00ffff };

/** Band of a damage value: 0 for anything that is not a positive number. */
export function shotBand(damage: number): number {
  if (!(damage >= SHOT_LOOK_BANDS[0])) return 0;
  if (damage < SHOT_LOOK_BANDS[1]) return 1;
  if (damage < SHOT_LOOK_BANDS[2]) return 2;
  if (damage < SHOT_LOOK_BANDS[3]) return 3;
  return 4;
}

/** The look of a shot of this damage. */
export const shotLookFor = (damage: number): ShotLook => SHOT_LOOKS[shotBand(damage)];
