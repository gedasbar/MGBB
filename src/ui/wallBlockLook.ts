/**
 * Wall block colours by HP (chunk 26a): the fill of a wall block (the square inside the frame) follows the block's MAX HP in log bands,
 * so a glance at the wall says how tough it is. Same bands in the campaign and on the Frontier. Flat colours (art language), chosen to stay
 * clear of the armor frame (light grey), the shield bar (cyan), the shot colours (cyan, pale cyan, yellow, orange, magenta), the burn and
 * freeze overlays and the dark backgrounds. The first band is the green the blocks always had. Damage (the shrinking square, the white
 * flash) is drawn on top and does not change the band: a block keeps the colour of its max HP.
 *
 *   under 100    green       100 - 999    blue      1K - 9.9K   violet      10K - 99K   coral red      100K and up   pink
 */

/** Lowest max HP of bands 1 to 4: under 100, 100-999, 1K-9.9K, 10K-99K, 100K and up. */
export const WALL_HP_BANDS: readonly number[] = [100, 1000, 10000, 100000];

/** Fill colour of each band (index = `wallHpBand`). */
export const WALL_HP_COLORS: readonly number[] = [0x6fbf73, 0x4f86e0, 0x9b6ad9, 0xd95a4e, 0xff6fb5];

/** How far toward white a block fill goes in its hit flash (0 to 1). */
export const WALL_FLASH_MIX = 0.7;

/** Band (0 to 4) of a block's max HP; anything that is not a positive number is band 0. */
export function wallHpBand(maxHp: number): number {
  let band = 0;
  for (const edge of WALL_HP_BANDS) if (maxHp >= edge) band++;
  return band;
}

/** Fill colour of a block with this max HP. */
export const wallFillColor = (maxHp: number): number => WALL_HP_COLORS[wallHpBand(maxHp)];

/** The same colour pushed toward white by `WALL_FLASH_MIX`, for a block that was just hit. */
export function wallFlashColor(maxHp: number): number {
  const c = wallFillColor(maxHp);
  const mix = (s: number) => Math.round(((c >> s) & 255) + (255 - ((c >> s) & 255)) * WALL_FLASH_MIX);
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}
