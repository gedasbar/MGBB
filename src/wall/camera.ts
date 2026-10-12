import { shipHalfW } from '../config';
import { wrapDx, wrapX } from '../engine/wrap';
import { CAMERA_EASE, CAMERA_MAX_X, EDGE_ZONE, MAX_CAMERA_SPEED, VIEW_W } from './constants';

/** Ship-centre x clamped so the whole ship stays on screen: [m, viewW - m]. */
export function clampShipX(x: number, viewW = VIEW_W): number {
  const m = shipHalfW(viewW);
  return Math.max(m, Math.min(viewW - m, x));
}

/**
 * Target camera speed in px/s for a ship at screen x (negative = scroll left).
 * 0 at the inner edge of the outer zone, rising linearly to maxSpeed exactly at the clamp edge m (or viewW - m).
 */
export function edgePushSpeed(shipX: number, viewW = VIEW_W, zoneFrac = EDGE_ZONE, maxSpeed = MAX_CAMERA_SPEED): number {
  const zone = viewW * zoneFrac;
  const m = shipHalfW(viewW);
  const span = zone - m;
  // Distance to the nearest side, so both sides use the same arithmetic and hit the max exactly at m.
  const dLeft = shipX, dRight = viewW - shipX;
  if (dLeft < zone) return -maxSpeed * Math.min(1, (zone - dLeft) / span);
  if (dRight < zone) return maxSpeed * Math.min(1, (zone - dRight) / span);
  return 0;
}

/**
 * Screen x of a world x. On a ring the short way round from the viewport centre (so nothing pops or doubles at the seam);
 * on a flat wall plain x - camera x.
 */
export function ringScreenX(x: number, camX: number, viewW: number, worldW: number, ring: boolean): number {
  return ring ? wrapDx(x, camX + viewW / 2, worldW) + viewW / 2 : x - camX;
}

/**
 * Horizontal camera of a wall level: x of the viewport's left edge in world px. Clamped to [minX, maxX], or, on a ring
 * (`wrapW` > 0), unclamped: x wraps into [0, wrapW) and `travel` is the unwrapped distance covered (rightwards positive).
 */
export class WallCamera {
  x: number;
  /** Current speed in px/s (follows the edge-push target with easing). */
  speed = 0;

  /**
   * `minX`/`maxX` bound the camera. They stretch past the wall by the gun's ejector offset, so the ejector (not the ship
   * centre) can reach both world edges.
   */
  constructor(readonly minX = 0, readonly maxX = CAMERA_MAX_X, readonly wrapW = 0) {
    // Centred: the ship starts above the middle column.
    this.x = wrapW > 0 ? wrapX((wrapW - VIEW_W) / 2, wrapW) : Math.max(minX, Math.min(maxX, (minX + maxX) / 2));
  }

  /** Unwrapped distance travelled (rings). */
  travel = 0;

  /** `pointerX` is the (clamped) ship screen x in px, or null when nothing should push (touch released, pointer unseen). */
  update(dt: number, pointerX: number | null) {
    const target = pointerX === null ? 0 : edgePushSpeed(pointerX);
    this.speed += (target - this.speed) * (1 - Math.exp(-CAMERA_EASE * dt));
    if (target === 0 && Math.abs(this.speed) < 2) this.speed = 0;
    this.x += this.speed * dt;
    if (this.wrapW > 0) {
      this.travel += this.speed * dt;
      this.x = wrapX(this.x, this.wrapW);
      return;
    }
    if (this.x <= this.minX) { this.x = this.minX; if (this.speed < 0) this.speed = 0; }
    else if (this.x >= this.maxX) { this.x = this.maxX; if (this.speed > 0) this.speed = 0; }
  }
}
