import { CONFIG } from '../config';

/** Remembered recent targets per projectile (Orbit). */
export const RING = 4;

export class ProjectilePool {
  max: number;
  count: number = 0;
  
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  damage: Float32Array;
  pure: Float32Array;
  modIndex: Uint16Array;
  active: Uint8Array;
  spriteIndex: Uint32Array;
  /** Size multiplier (hit radius and sprite); 1 for a normal projectile. */
  size: Float32Array;
  /** Seconds since launch. */
  age: Float32Array;
  /** Enemy id this projectile must not hit (a fork copy spawns inside the enemy that forked it); -1 = none. */
  skipId: Int32Array;
  /** 1 = a fork copy, which cannot fork again. */
  copy: Uint8Array;
  /** Per-projectile scratch state of steering modifiers (random curve noise). */
  aux1: Float32Array;
  aux2: Float32Array;
  aux3: Float32Array;
  /** Movement phase of Orbit / Boomerang / Mine projectiles (PHASE_* in projectiles.ts); 0 = a plain projectile. */
  phase: Uint8Array;
  /** Scratch state of the phase: heading angle, elapsed time, distance travelled. */
  s1: Float32Array;
  s2: Float32Array;
  s3: Float32Array;
  /** Orbit: the last targets hit (id) and when (seconds left before they may be hit again), a ring of RING per projectile. */
  ringId: Int32Array;
  ringT: Float32Array;
  ringN: Uint8Array;
  /** Bouncing: bounces left (-1 = the projectile has no Bouncing block). */
  bounces: Int8Array;

  constructor(max: number = CONFIG.CAPS.PROJECTILES) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.damage = new Float32Array(max);
    this.pure = new Float32Array(max);
    this.modIndex = new Uint16Array(max);
    this.active = new Uint8Array(max);
    this.spriteIndex = new Uint32Array(max);
    this.size = new Float32Array(max);
    this.age = new Float32Array(max);
    this.skipId = new Int32Array(max);
    this.copy = new Uint8Array(max);
    this.aux1 = new Float32Array(max);
    this.aux2 = new Float32Array(max);
    this.aux3 = new Float32Array(max);
    this.phase = new Uint8Array(max);
    this.s1 = new Float32Array(max);
    this.s2 = new Float32Array(max);
    this.s3 = new Float32Array(max);
    this.ringId = new Int32Array(max * RING);
    this.ringT = new Float32Array(max * RING);
    this.ringN = new Uint8Array(max);
    this.bounces = new Int8Array(max).fill(-1);
  }

  spawn(x: number, y: number, vx: number, vy: number, damage: number, pure: number = 0, modIndex: number = 0): number {
    if (this.count >= this.max) return -1;
    for (let i = 0; i < this.max; i++) {
      if (this.active[i] === 0) {
        this.active[i] = 1;
        this.x[i] = x;
        this.y[i] = y;
        this.vx[i] = vx;
        this.vy[i] = vy;
        this.damage[i] = damage;
        this.pure[i] = pure;
        this.modIndex[i] = modIndex;
        this.size[i] = 1;
        this.age[i] = 0;
        this.skipId[i] = -1;
        this.copy[i] = 0;
        this.aux1[i] = 0;
        this.aux2[i] = 0;
        this.aux3[i] = 0;
        this.phase[i] = 0;
        this.s1[i] = 0;
        this.s2[i] = 0;
        this.s3[i] = 0;
        this.ringN[i] = 0;
        this.bounces[i] = -1;
        this.count++;
        return i;
      }
    }
    return -1;
  }

  free(i: number) {
    if (this.active[i]) {
      this.active[i] = 0;
      this.count--;
    }
  }
}
