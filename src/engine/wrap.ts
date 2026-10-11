import { CONFIG } from '../config';

/** Free Fly is a cylinder: this many viewport widths around, left and right never end. */
export const FREE_FLY_WORLD_SCREENS = 3;
/** Width of the Free Fly world in px. All Free Fly x positions live in [0, WORLD_W). (The wall's own width is WORLD_WIDTH.) */
export const WORLD_W = CONFIG.VIEW.W * FREE_FLY_WORLD_SCREENS;

/** x folded into [0, W). */
export function wrapX(x: number, w: number = WORLD_W): number {
  const r = x % w;
  return r < 0 ? r + w : r;
}

/** Shortest signed delta from b to a on the cylinder, in [-W/2, W/2). Positive = a lies to the right of b. */
export function wrapDx(a: number, b: number, w: number = WORLD_W): number {
  const d = a - b;
  return d - w * Math.round(d / w);
}

/** Distance between two points on the cylinder (x wraps, y does not). */
export function wrapDist(ax: number, ay: number, bx: number, by: number, w: number = WORLD_W): number {
  return Math.hypot(wrapDx(ax, bx, w), ay - by);
}
