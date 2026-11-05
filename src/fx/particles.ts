import { FEEL, ParticleMode } from '../data/feel';

/** One shared pool of flat shards and sparks (chunk 34a). Typed arrays, a fixed cap, no allocation while it runs. Pure: the view draws it. */
export class ParticleSystem {
  readonly max = FEEL.PARTICLES.CAP_HIGH;
  readonly x = new Float32Array(this.max);
  readonly y = new Float32Array(this.max);
  readonly vx = new Float32Array(this.max);
  readonly vy = new Float32Array(this.max);
  readonly rot = new Float32Array(this.max);
  readonly vr = new Float32Array(this.max);
  readonly life = new Float32Array(this.max);
  readonly maxLife = new Float32Array(this.max);
  readonly size = new Float32Array(this.max);
  readonly color = new Uint32Array(this.max);
  count = 0;
  /** Particles refused because the pool was at its cap. */
  refused = 0;
  mode: ParticleMode = 'high';
  private free = 0;

  get cap(): number { return this.mode === 'low' ? FEEL.PARTICLES.CAP_LOW : FEEL.PARTICLES.CAP_HIGH; }
  /** Every burst's count is scaled by this (Low halves it). */
  get scale(): number { return this.mode === 'low' ? FEEL.PARTICLES.LOW_SCALE : 1; }

  /** The next free slot, or -1 when the pool is at its cap. */
  private slot(): number {
    if (this.count >= this.cap) { this.refused++; return -1; }
    for (let n = 0; n < this.max; n++) {
      const i = (this.free + n) % this.max;
      if (this.life[i] <= 0) { this.free = (i + 1) % this.max; return i; }
    }
    return -1;
  }

  spawn(x: number, y: number, vx: number, vy: number, size: number, color: number, life: number, spin = 0): boolean {
    const i = this.slot();
    if (i < 0) return false;
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.rot[i] = 0; this.vr[i] = spin;
    this.size[i] = size; this.color[i] = color;
    this.life[i] = this.maxLife[i] = life;
    this.count++;
    return true;
  }

  /** `n` shards thrown outwards from (x, y), spinning, in the given colours. */
  burst(x: number, y: number, n: number, colors: readonly number[], rnd: () => number, speed: readonly number[] = FEEL.PARTICLES.BLOCK_SPEED, size: readonly number[] = FEEL.PARTICLES.SHARD_SIZE, life: number = FEEL.PARTICLES.LIFE) {
    const k = Math.max(1, Math.round(n * this.scale));
    for (let j = 0; j < k; j++) {
      const a = rnd() * Math.PI * 2;
      const s = speed[0] + rnd() * (speed[1] - speed[0]);
      const col = colors[Math.floor(rnd() * colors.length) % colors.length];
      if (!this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, size[0] + rnd() * (size[1] - size[0]), col, life * (0.75 + rnd() * 0.5), (rnd() - 0.5) * 18)) break;
    }
  }

  update(dt: number) {
    const drag = Math.max(0, 1 - FEEL.PARTICLES.DRAG * dt);
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      this.vx[i] *= drag;
      this.vy[i] *= drag;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += this.vr[i] * dt;
      n++;
    }
    this.count = n;
  }

  clear() { this.life.fill(0); this.count = 0; }
}

/** A flat expanding outline: a circle (w = h = 0) or a rectangle of w x h centred on (x, y). */
export interface Ring { x: number; y: number; r0: number; r1: number; w: number; h: number; life: number; maxLife: number; color: number }

/** The few expanding rings and rectangles alive at once (AoE blast areas, shockwaves). Capped; the oldest is replaced when full. */
export class RingList {
  readonly list: Ring[] = [];
  add(r: Omit<Ring, 'maxLife'>) {
    if (this.list.length >= FEEL.RINGS.CAP) this.list.shift();
    this.list.push({ ...r, maxLife: r.life });
  }
  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      this.list[i].life -= dt;
      if (this.list[i].life <= 0) this.list.splice(i, 1);
    }
  }
}
