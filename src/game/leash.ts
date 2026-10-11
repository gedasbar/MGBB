import { CONFIG } from '../config';
import { wrapDist, wrapDx, wrapX, WORLD_W } from '../engine/wrap';

/** Free Fly enemy leash, in viewport widths and seconds. */
export const LEASH_NEAR = 1.2;
export const LEASH_FAR = 1.5;
/** A rock that is being pulled keeps being pulled until it is this close (viewport widths), so it does not hover at the leash edge. */
export const LEASH_RELEASE = 0.9;
export const LEASH_NEAR_TIME = 4;
export const LEASH_FAR_TIME = 10;
/** Speed of a rock's own drift (px/s); a leashed rock closes in on the ship at this speed. */
export const ENEMY_SPEED = 40;

export type LeashAction = 'none' | 'pull' | 'respawn';

interface Leashed { x: number; y: number; farT: number; farT2: number }

/**
 * Advances an enemy's leash timers. Beyond LEASH_NEAR widths (wrapped distance) for LEASH_NEAR_TIME it must steer to the
 * ship ('pull'); beyond LEASH_FAR widths for LEASH_FAR_TIME it must be moved back to the spawn ring ('respawn').
 */
export function leashStep(e: Leashed, shipX: number, shipY: number, dt: number, viewW = CONFIG.VIEW.W, worldW = WORLD_W): LeashAction {
  const d = wrapDist(e.x, e.y, shipX, shipY, worldW);
  const pulling = e.farT > LEASH_NEAR_TIME && d > LEASH_RELEASE * viewW;
  e.farT = d > LEASH_NEAR * viewW || pulling ? e.farT + dt : 0;
  e.farT2 = d > LEASH_FAR * viewW ? e.farT2 + dt : 0;
  if (e.farT2 > LEASH_FAR_TIME) return 'respawn';
  return e.farT > LEASH_NEAR_TIME ? 'pull' : 'none';
}

/** Unit vector from an enemy to the ship, the short way round the cylinder. */
export function towardShip(e: { x: number; y: number }, shipX: number, shipY: number, worldW = WORLD_W): { x: number; y: number } {
  const dx = wrapDx(shipX, e.x, worldW);
  const dy = shipY - e.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: dx / d, y: dy / d };
}

/**
 * A point just off-screen, mostly above and to the sides of the view (never below, never inside it), in wrapped world x.
 * `camX` is the viewport's left edge; `rand` returns [0, 1).
 */
export function ringSpawnPoint(camX: number, rand: () => number, viewW = CONFIG.VIEW.W, viewH = CONFIG.VIEW.H, worldW = WORLD_W): { x: number; y: number } {
  const r = rand();
  if (r < 0.45) {
    // Above the top edge, anywhere across the width (and a little past it).
    return { x: wrapX(camX + (rand() * 1.2 - 0.1) * viewW, worldW), y: -30 - rand() * 70 };
  }
  // Beside the view, upper part of the screen so they drift into it.
  const left = r < 0.725;
  const out = 30 + rand() * 80;
  const sx = left ? -out : viewW + out;
  return { x: wrapX(camX + sx, worldW), y: -20 + rand() * 0.55 * viewH };
}
