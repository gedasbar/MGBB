/**
 * Ring maths for the campaign walls (a wall with `wrap: true` is a cylinder `w` px around). Free Fly does not use it: it is
 * one fixed screen wide.
 */

/** x folded into [0, w). */
export function wrapX(x: number, w: number): number {
  const r = x % w;
  return r < 0 ? r + w : r;
}

/** Shortest signed delta from b to a on the ring, in [-w/2, w/2). Positive = a lies to the right of b. */
export function wrapDx(a: number, b: number, w: number): number {
  const d = a - b;
  return d - w * Math.round(d / w);
}

/** Distance between two points on the ring (x wraps, y does not). */
export function wrapDist(ax: number, ay: number, bx: number, by: number, w: number): number {
  return Math.hypot(wrapDx(ax, bx, w), ay - by);
}
