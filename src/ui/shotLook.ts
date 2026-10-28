/**
 * Shot looks by damage (chunk 21a): a shot's drawing steps up with its damage, in log bands. Flat and geometric (art language), the colour
 * is never touched here. Pure data and two functions; the sprites are set in FlyScreen / WallScreen through `applyShotLook`.
 *
 * Band 0 is the look every shot had before (a 6 x 14 bar). Bands 1 and 2 are the same bar, longer and thicker; bands 3 and 4 swap the bar
 * for a pointed bolt (a flat hexagon). Boomerang, Orbit and Mine phases keep their own look, so `applyShotLook` is only called for a shot in
 * plain flight.
 */

/** Lowest damage of bands 1, 2, 3 and 4: under 10, 10-99, 100-999, 1K-9.9K, 10K and up. */
export const SHOT_LOOK_BANDS: readonly number[] = [10, 100, 1000, 10000];

export interface ShotLook {
  /** Sprite width and height in px at size 1 (a Fork copy's smaller size scales both). */
  w: number;
  h: number;
  /** Draw the pointed bolt instead of the plain bar. */
  bolt: boolean;
}

export const SHOT_LOOKS: readonly ShotLook[] = [
  { w: 6, h: 14, bolt: false },
  { w: 7, h: 18, bolt: false },
  { w: 8, h: 22, bolt: false },
  { w: 10, h: 26, bolt: true },
  { w: 12, h: 32, bolt: true },
];

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
