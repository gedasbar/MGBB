import { CONFIG } from '../config';
import { PROJECTILE_MAX_AGE } from '../wall/constants';
import { HOMING_RETARGET, HOMING_STAGGER } from './effects';

/** What a new shot is, for the overload rule (CONFIG.OVERLOAD.REFUSE_FROM): the cheapest kinds are refused first. */
export type SpawnKind = keyof typeof CONFIG.OVERLOAD.REFUSE_FROM;

/** Remembered recent targets per projectile (Orbit). */
export const RING = 4;

export class ProjectilePool {
  max: number;
  count: number = 0;
  
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** Double precision: a stacked build's damage can pass what a Float32 holds (chunk 16c-2). */
  damage: Float64Array;
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
  /** Chunk 17b: hits so far (saturates at 255) and Chain Lightning chains fired, for the trigger table. */
  hits: Uint8Array;
  chains: Uint8Array;
  /** Chunk 19a: targets this shot has passed through since launch (or since its last bounce): the Piercing count. */
  pierced: Uint8Array;
  /** 1 = an AoE blast is still owed where the shot last hit (it flew on; the blast comes when it leaves play: ProjectileSystem.retire). */
  aoePending: Uint8Array;
  /** The shot's damage at its first hit: an AoE blast owed to the end of a piercing shot keeps it (piercing only pays for the direct hits). */
  firstDamage: Float64Array;
  lastX: Float32Array;
  lastY: Float32Array;
  /** Chunk 20a, Zigzag: direction changes so far and the time into the current leg (-1 = the first leg has not been started). */
  zigN: Uint8Array;
  zigT: Float32Array;
  /** Chunk 20b: seconds the shot may live (Extender doubles it), the ship's x when it was fired (Centreline), its position before this step's move (swept hit test)  */
  life: Float32Array;
  anchorX: Float32Array;
  /** Chunk 21a: degrees a Curving block has turned this shot so far (the total is capped per copy). */
  curved: Float32Array;
  prevX: Float32Array;
  prevY: Float32Array;
  /** The speed the shot was launched at: the pull of Centreline and Ship Magnet may slow it and turn it, never speed it past this. */
  vmax: Float32Array;
  /** Chunk 21b, Homing: the id of the target the shot is locked on (-1 = none) and the seconds until it may search again. */
  homeId: Int32Array;
  homeT: Float32Array;
  /** Chunk 21b: the shot's age at its last hit (a shot that has not hit anything for a while is the first to go when the pool is nearly full). */
  hitAge: Float32Array;
  /** Lowest slot that may be free: spawn() looks from here instead of from 0 (the slot it picks is still the lowest free one). */
  private freeFrom = 0;

  constructor(max: number = CONFIG.CAPS.PROJECTILES) {
    this.max = max;
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.damage = new Float64Array(max);
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
    this.hits = new Uint8Array(max);
    this.chains = new Uint8Array(max);
    this.pierced = new Uint8Array(max);
    this.aoePending = new Uint8Array(max);
    this.firstDamage = new Float64Array(max);
    this.lastX = new Float32Array(max);
    this.lastY = new Float32Array(max);
    this.zigN = new Uint8Array(max);
    this.zigT = new Float32Array(max);
    this.life = new Float32Array(max).fill(PROJECTILE_MAX_AGE);
    this.anchorX = new Float32Array(max);
    this.curved = new Float32Array(max);
    this.prevX = new Float32Array(max);
    this.prevY = new Float32Array(max);
    this.vmax = new Float32Array(max);
    this.homeId = new Int32Array(max).fill(-1);
    this.homeT = new Float32Array(max);
    this.hitAge = new Float32Array(max);
  }

  /** Shots refused by the overload rule, by kind (a refusal is counted by `admits`; normal shots count when the pool is completely full). */
  readonly refused: Record<SpawnKind, number> = { fork: 0, mirror: 0, extra: 0, normal: 0 };

  /** True when a shot of this kind may still be made (chunk 21b: the pool refuses the cheapest kinds first as it fills). A refusal is counted. */
  admits(kind: SpawnKind): boolean {
    if (this.count < this.max * CONFIG.OVERLOAD.REFUSE_FROM[kind]) return true;
    this.refused[kind]++;
    return false;
  }

  spawn(x: number, y: number, vx: number, vy: number, damage: number, pure: number = 0, modIndex: number = 0): number {
    if (this.count >= this.max) { this.refused.normal++; return -1; }
    for (let i = this.freeFrom; i < this.max; i++) {
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
        this.hits[i] = 0;
        this.chains[i] = 0;
        this.pierced[i] = 0;
        this.aoePending[i] = 0;
        this.zigN[i] = 0;
        this.zigT[i] = -1;
        this.life[i] = PROJECTILE_MAX_AGE;
        this.anchorX[i] = x;
        this.curved[i] = 0;
        this.prevX[i] = x;
        this.prevY[i] = y;
        this.vmax[i] = Math.hypot(vx, vy);
        this.homeId[i] = -1;
        this.homeT[i] = (i % HOMING_STAGGER) * (HOMING_RETARGET / HOMING_STAGGER);
        this.hitAge[i] = 0;
        this.count++;
        this.freeFrom = i + 1;
        return i;
      }
    }
    if (this.freeFrom > 0) { this.freeFrom = 0; return this.spawn(x, y, vx, vy, damage, pure, modIndex); } // slots were cleared behind the hint
    return -1;
  }

  free(i: number) {
    if (this.active[i]) {
      this.active[i] = 0;
      this.count--;
      if (i < this.freeFrom) this.freeFrom = i;
    }
  }
}
