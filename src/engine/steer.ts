import { SHIP_MAX_SPEED, TOUCH_DIRECT_OFFSET_Y, TOUCH_DRAG_GAIN } from '../config';

/** Chunk 24a. Where the player wants the ship (screen space), from the pointer; the world then flies there at SHIP_MAX_SPEED at most. */

export type TouchMode = 'relative' | 'direct';
export const TOUCH_MODES: readonly TouchMode[] = ['relative', 'direct'];

/** What the steering reads of the pointer (PointerState has more). */
export interface SteerPointer { x: number; y: number; active: boolean; type: string; seen: boolean }

export interface SteerBounds { minX: number; maxX: number; minY: number; maxY: number }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The ship's target point in screen space.
 *  - Mouse / pen: the target is the cursor (the ship follows it, speed-capped by the world).
 *  - Touch, relative (default): a finger anywhere moves the target by the finger's own movement (x TOUCH_DRAG_GAIN), never to the finger's
 *    position; lifting the finger leaves the target where it was.
 *  - Touch, direct: the target is the finger (a little above it) while it is down, and stays when it lifts.
 * The target is kept inside the bounds, so a ship held against a side stays there: the camera's edge push follows the ship, not the input.
 */
export class ShipSteer {
  x: number;
  y: number;
  /** The last finger position of the current press (relative mode); null while no finger is down. */
  private last: { x: number; y: number } | null = null;

  constructor(startX: number, startY: number, private bounds: SteerBounds, public mode: TouchMode = 'relative', private gain = TOUCH_DRAG_GAIN) {
    this.x = startX;
    this.y = startY;
  }

  /** Forget the finger (after a pause, or when a press was taken by a UI control): the next press starts a new drag. */
  release() { this.last = null; }

  /** Reads the pointer once per simulation step. */
  update(p: SteerPointer) {
    if (!p.seen) return;
    const b = this.bounds;
    if (p.type !== 'touch') {
      this.x = clamp(p.x, b.minX, b.maxX);
      this.y = clamp(p.y, b.minY, b.maxY);
      this.last = null;
      return;
    }
    if (!p.active) { this.last = null; return; }
    if (this.mode === 'direct') {
      this.x = clamp(p.x, b.minX, b.maxX);
      this.y = clamp(p.y + TOUCH_DIRECT_OFFSET_Y, b.minY, b.maxY);
      this.last = { x: p.x, y: p.y };
      return;
    }
    if (this.last) {
      this.x = clamp(this.x + (p.x - this.last.x) * this.gain, b.minX, b.maxX);
      this.y = clamp(this.y + (p.y - this.last.y) * this.gain, b.minY, b.maxY);
    }
    this.last = { x: p.x, y: p.y };
  }
}

/** One step of a ship flying from (x, y) toward (tx, ty) at SHIP_MAX_SPEED at most: the new point. `dx` overrides tx - x (a ring's short way round). */
export function stepToward(x: number, y: number, tx: number, ty: number, dt: number, dxOverride?: number, maxSpeed = SHIP_MAX_SPEED): { dx: number; dy: number } {
  const dx = dxOverride ?? tx - x;
  const dy = ty - y;
  const dist = Math.hypot(dx, dy);
  const max = maxSpeed * dt;
  if (dist <= max || dist === 0) return { dx, dy };
  const k = max / dist;
  return { dx: dx * k, dy: dy * k };
}

/** Squared distance from the point (px, py) to the segment (ax, ay)-(bx, by). */
export function segDistSq(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1);
  const cx = ax + vx * t - px, cy = ay + vy * t - py;
  return cx * cx + cy * cy;
}
