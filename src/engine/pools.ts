import { CONFIG } from '../config';

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
