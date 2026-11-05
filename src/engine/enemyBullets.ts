import { CONFIG } from '../config';
import { ENEMY_BULLET_CAP, ENEMY_BULLET_MARGIN, ENEMY_BULLET_RADIUS } from '../data/enemyBullets';
import { segDistSq } from './steer';

/**
 * The pool of enemy bullets (chunk 32a): flat typed arrays, a free-slot scan with a hint, no allocation per shot.
 * A bullet only moves, leaves the screen or hits the ship. It knows nothing about its shooter, so it outlives it.
 */
export class EnemyBullets {
  readonly max: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly active: Uint8Array;
  count = 0;
  /** Shots refused because the pool was full (a counter for tests and the stats overlay). */
  refused = 0;
  private hint = 0;

  constructor(max = ENEMY_BULLET_CAP) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.active = new Uint8Array(max);
  }

  /** Fires one bullet; false (and counted) when the pool is full. */
  spawn(x: number, y: number, vx: number, vy: number): boolean {
    for (let n = 0; n < this.max; n++) {
      const i = (this.hint + n) % this.max;
      if (this.active[i]) continue;
      this.active[i] = 1;
      this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
      this.count++;
      this.hint = (i + 1) % this.max;
      return true;
    }
    this.refused++;
    return false;
  }

  /** Moves every bullet and removes those that have left the screen. */
  update(dt: number) {
    if (this.count === 0) return;
    const W = CONFIG.VIEW.W, H = CONFIG.VIEW.H, m = ENEMY_BULLET_MARGIN;
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i]) continue;
      const x = (this.x[i] += this.vx[i] * dt);
      const y = (this.y[i] += this.vy[i] * dt);
      if (x < -m || x > W + m || y < -m || y > H + m) this.remove(i);
    }
  }

  /**
   * The first bullet touching the ship's hit circle (radius `hitR`), measured against the ship's path from (fx, fy) to (tx, ty)
   * this step; -1 if none. Does not remove it: the world decides (an invulnerable ship lets bullets fly through).
   */
  firstHit(fx: number, fy: number, tx: number, ty: number, hitR: number): number {
    if (this.count === 0) return -1;
    const reach = hitR + ENEMY_BULLET_RADIUS;
    const r2 = reach * reach;
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i]) continue;
      if (segDistSq(fx, fy, tx, ty, this.x[i], this.y[i]) < r2) return i;
    }
    return -1;
  }

  remove(i: number) {
    if (!this.active[i]) return;
    this.active[i] = 0;
    this.count--;
  }

  clear() {
    this.active.fill(0);
    this.count = 0;
    this.hint = 0;
  }
}
