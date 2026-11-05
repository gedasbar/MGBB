import { FEEL, ParticleMode, ShakeMode } from '../data/feel';
import { FrameBudget, HitStop, Shake } from './feel';
import { ParticleSystem, RingList } from './particles';

export interface FeelSettings { shake: ShakeMode; particles: ParticleMode; hitStop: boolean }

/** A queued explosion of a boss death chain: fires when `t` reaches 0. */
interface Blast { t: number; x: number; y: number; big: boolean }

const BLAST_COLORS = [0xffd23c, 0xff9a3c, 0xd4d4d8];

/**
 * Everything the feel pass keeps for one run (chunk 34a): the shake, the hit stop, the particle pool, the rings, the auto-drop and the boss death chain.
 * The screens call the methods below when something happens; no gameplay state is read or written here.
 */
export class FeelHub {
  readonly shake: Shake;
  readonly stop = new HitStop();
  readonly particles = new ParticleSystem();
  readonly rings = new RingList();
  readonly budget = new FrameBudget();
  private blasts: Blast[] = [];
  private sparksThisFrame = 0;
  /** Boss damage tracking for the small shake of big boss hits. */
  private bossLost = 0;
  private bossWindow = 0;
  private bossLastHp = -1;
  /** True once the budget has pushed the particles to Low (not saved). */
  autoDropped = false;

  constructor(private rnd: () => number = Math.random) {
    this.shake = new Shake(rnd);
  }

  applySettings(s: FeelSettings) {
    this.shake.mode = s.shake;
    this.stop.on = s.hitStop;
    this.particles.mode = this.autoDropped ? 'low' : s.particles;
  }

  // ---- events
  blockDestroyed(x: number, y: number, color: number, hard: boolean) {
    const P = FEEL.PARTICLES;
    const n = P.BLOCK_SHARDS[0] + Math.floor(this.rnd() * (P.BLOCK_SHARDS[1] - P.BLOCK_SHARDS[0] + 1));
    this.particles.burst(x, y, n, [color], this.rnd);
    if (hard) this.shake.add('small');
  }

  rockKilled(x: number, y: number, radius: number, colors: readonly number[], split: boolean) {
    const P = FEEL.PARTICLES;
    const n = Math.min(P.ROCK_SHARDS_MAX, P.ROCK_SHARDS_BASE + Math.round((radius / 10) * P.ROCK_SHARDS_PER_10PX));
    this.particles.burst(x, y, split ? Math.max(P.SPLIT_SHARDS, Math.round(n / 2)) : n, colors, this.rnd);
  }

  /** A tiny spark burst at a hit point; at most SPARK_FRAME_CAP hits a frame make one. */
  spark(x: number, y: number, color: number) {
    const P = FEEL.PARTICLES;
    if (this.sparksThisFrame >= P.SPARK_FRAME_CAP) return;
    this.sparksThisFrame++;
    const n = P.SPARKS[0] + Math.floor(this.rnd() * (P.SPARKS[1] - P.SPARKS[0] + 1));
    this.particles.burst(x, y, n, [color], this.rnd, P.SPARK_SPEED, P.SPARK_SIZE, P.SPARK_LIFE);
  }

  /** A tiny flash at the muzzle; none when the gun fires more than MUZZLE_MAX_RATE pulses a second. */
  muzzle(x: number, y: number, pulsesPerSec: number, color: number): boolean {
    const P = FEEL.PARTICLES;
    if (pulsesPerSec > P.MUZZLE_MAX_RATE) return false;
    return this.particles.spawn(x, y, 0, -40, P.MUZZLE_SIZE, color, P.MUZZLE_LIFE, 0);
  }

  /** An AoE blast: a circle of `radius`, or a w x h rectangle outline centred on (x, y). */
  aoe(x: number, y: number, radius: number, color: number, w = 0, h = 0) {
    this.rings.add({ x, y, r0: radius * 0.35, r1: radius, w, h, life: FEEL.RINGS.AOE_LIFE, color });
    this.shake.add('small');
  }

  playerHit() { this.shake.add('medium'); }
  bossArrival() { this.shake.add('medium'); }
  bossEnrage() { this.shake.add('medium'); }

  /** A single shot killed something with x10 or more its HP. */
  bigHit() { this.stop.request('big'); }

  crash(x: number, y: number, colors: readonly number[]) {
    this.particles.burst(x, y, FEEL.PARTICLES.CRASH_SHARDS, colors, this.rnd, [120, 340], [6, 14], 0.6);
    this.rings.add({ x, y, r0: 8, r1: FEEL.RINGS.SHOCK_RADIUS, w: 0, h: 0, life: FEEL.RINGS.SHOCK_LIFE, color: 0xd4d4d8 });
    this.shake.add('big');
    this.stop.request('crash');
  }

  /** A boss dies: a chain of explosions over it (queued), a big shard burst now, big shake and a stop. */
  bossDeath(x: number, y: number, w: number, h: number, colors: readonly number[]) {
    const P = FEEL.PARTICLES;
    for (let k = 0; k < P.BOSS_BLASTS; k++) {
      this.blasts.push({ t: k * P.BOSS_BLAST_GAP, x: x + (this.rnd() - 0.5) * w, y: y + (this.rnd() - 0.5) * h, big: k === P.BOSS_BLASTS - 1 });
    }
    this.particles.burst(x, y, P.BOSS_SHARDS, colors, this.rnd, [140, 360], [7, 16], 0.7);
    this.shake.add('big');
    this.stop.request('bossDeath');
  }

  /** Boss HP seen this frame; a share of its max lost inside the window gives a small shake. */
  bossHp(hp: number, maxHp: number, dt: number) {
    const S = FEEL.SHAKE;
    this.bossWindow += dt;
    if (this.bossLastHp >= 0 && hp < this.bossLastHp) this.bossLost += this.bossLastHp - hp;
    this.bossLastHp = hp;
    if (this.bossWindow >= S.BOSS_WINDOW) {
      if (maxHp > 0 && this.bossLost / maxHp >= S.BOSS_HIT_SHARE) this.shake.add('small');
      this.bossLost = 0;
      this.bossWindow = 0;
    }
  }
  bossGone() { this.bossLastHp = -1; this.bossLost = 0; this.bossWindow = 0; }

  /** Pending boss-death explosions (for tests). */
  get pendingBlasts(): number { return this.blasts.length; }

  /** Once a frame with the real frame time. Returns true if the simulation must be frozen this frame. */
  update(frameTime: number): boolean {
    this.sparksThisFrame = 0;
    if (this.budget.step(frameTime)) { this.autoDropped = true; this.particles.mode = 'low'; }
    this.shake.update(frameTime);
    this.particles.update(frameTime);
    this.rings.update(frameTime);
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t -= frameTime;
      if (b.t > 0) continue;
      this.blasts.splice(i, 1);
      this.particles.burst(b.x, b.y, b.big ? 26 : 12, BLAST_COLORS, this.rnd, [100, 300], [6, 14], 0.5);
      this.rings.add({ x: b.x, y: b.y, r0: 6, r1: b.big ? 120 : 60, w: 0, h: 0, life: 0.35, color: 0xffd23c });
      this.shake.add(b.big ? 'big' : 'small');
    }
    return this.stop.step(frameTime);
  }
}
