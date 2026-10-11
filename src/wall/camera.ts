import { wrapX } from '../engine/wrap';
import { CAMERA_EASE, CAMERA_MAX_X, EDGE_ZONE, MAX_CAMERA_SPEED, VIEW_W } from './constants';

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Target camera speed in px/s for a pointer at screen x (negative = scroll left).
 * 0 at the inner edge of the outer zone, MAX_CAMERA_SPEED at the screen edge, eased in between.
 */
export function edgePushSpeed(pointerX: number, viewW = VIEW_W, zoneFrac = EDGE_ZONE, maxSpeed = MAX_CAMERA_SPEED): number {
  const zone = viewW * zoneFrac;
  if (pointerX < zone) return -maxSpeed * smoothstep(Math.min(1, (zone - pointerX) / zone));
  if (pointerX > viewW - zone) return maxSpeed * smoothstep(Math.min(1, (pointerX - (viewW - zone)) / zone));
  return 0;
}

/**
 * Horizontal camera: x of the viewport's left edge in world px, clamped to the wall. With `wrapW` (Free Fly) there is no
 * clamp: the camera keeps going and x wraps into [0, wrapW); `travel` is the unwrapped distance covered (rightwards positive).
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
    this.x = wrapW > 0 ? 0 : Math.max(minX, Math.min(maxX, CAMERA_MAX_X / 2));
  }

  /** Unwrapped distance travelled (Free Fly). */
  travel = 0;

  /** `pointerX` is the pointer in screen px, or null when nothing should push (touch released, pointer unseen). */
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
