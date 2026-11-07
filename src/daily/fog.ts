// Chunk 35a: the Fog twist of the daily run. Enemies are only drawn near the ship: fully visible within FOG_CLEAR_SHARE of the radius, fading to nothing at the radius.
// A drawing rule only: the simulation (hit tests, spawns, damage) is unchanged, so a body you cannot see still hits you.

/** The inner share of the fog radius where bodies are fully visible. */
export const FOG_CLEAR_SHARE = 0.65;

/** Opacity (0..1) of a body `dist` px from the ship when the fog radius is `radius`. */
export function fogAlpha(dist: number, radius: number): number {
  if (!(radius > 0)) return 1;
  const clear = radius * FOG_CLEAR_SHARE;
  if (dist <= clear) return 1;
  if (dist >= radius) return 0;
  return 1 - (dist - clear) / (radius - clear);
}
