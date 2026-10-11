import { EjectorRecipe, Grid } from '../engine/compiler';
import { evalDamage, isDynamic } from '../engine/compilerTypes';
import { OVERCLOCK_WINDOW } from '../engine/effects';
import { ProjectilePool } from '../engine/pools';
import { ProjectileSystem } from '../engine/projectiles';
import { rng } from '../rng';
import { FIRE_OFFSET_SCALE } from '../wall/constants';

export const PROJECTILE_SPEED = 600;
/** Ship-space pixels per hull cell: an ejector's offset from the hull centre is scaled by this when projectiles spawn. */
export const PX_PER_CELL = 14;

/** Where each recipe's projectiles leave, relative to the ship centre (the ejector's cell offset x PX_PER_CELL x FIRE_OFFSET_SCALE). */
export function spawnOffsetsFor(recipes: EjectorRecipe[], hull: Grid): { x: number; y: number }[] {
  return recipes.map(r => ({
    x: (r.x - (hull.w - 1) / 2) * PX_PER_CELL * FIRE_OFFSET_SCALE,
    y: (r.y - (hull.h - 1) / 2) * PX_PER_CELL * FIRE_OFFSET_SCALE,
  }));
}

/** Shots held back by a Delay Line (a fixed ring; 4 pulses/s x 12 recipes x 0.5 s is far below it). */
const DELAY_CAP = 512;

/** Counters of the pulse-level blocks (debug hook and tests). */
export interface GunCounters {
  /** Pulses on which an Alternator sent the packet to its other output. */
  alternations: number;
  capacitorAbsorbed: number;
  capacitorEmits: number;
  delayedShots: number;
  delayReleases: number;
  /** Highest Overclock multiplier a packet carried (1 = never boosted). */
  overclockPeak: number;
  /** Streaks that started over after the window. */
  overclockResets: number;
}

/**
 * The firing side of a ship: turns one pulse into projectiles. Plain circuits are stateless (one projectile per recipe,
 * damage from the compiled packet, chance gates rolled here). Circuits with Alternator, Capacitor, Overclock or Delay
 * Line keep state between pulses, one slot per recipe and stage, and are evaluated stage by stage in path order.
 */
export class Gun {
  /** Seconds of simulated time (advanced by update). */
  time = 0;
  readonly fx: GunCounters = {
    alternations: 0, capacitorAbsorbed: 0, capacitorEmits: 0, delayedShots: 0, delayReleases: 0, overclockPeak: 1, overclockResets: 0,
  };

  private readonly dyn: boolean[];
  /** Per recipe: 3 numbers per op (Overclock: streak, last time; Capacitor: bank, count). */
  private readonly st: Float64Array[];
  /** Alternator counters, by block cell key: how many pulses have passed through it. */
  private readonly altKeys = new Map<number, number>();
  private readonly altCount: Int32Array;
  private readonly altStamp: Int32Array;
  private readonly altCur: Int32Array;
  private pulseNo = 0;
  /** Overclock streaks reset after this long without a packet: 1 s, or 1.5 pulse periods on a slow hull. */
  private readonly window: number;

  // Delay queue (struct of arrays, no allocation per shot).
  private dqT = new Float64Array(DELAY_CAP);
  private dqR = new Int16Array(DELAY_CAP);
  private dqD = new Float32Array(DELAY_CAP);
  private dqN = 0;

  constructor(
    private pool: ProjectilePool, private projSys: ProjectileSystem, private recipes: EjectorRecipe[],
    private offsets: { x: number; y: number }[], pulsePeriod = 0.25,
  ) {
    this.dyn = recipes.map(r => isDynamic(r.packet));
    this.st = recipes.map(r => new Float64Array(Math.max(1, r.packet.ops.length) * 3));
    for (const r of recipes) {
      for (const op of r.packet.ops) if (op.t === 'alt' && !this.altKeys.has(op.key)) this.altKeys.set(op.key, this.altKeys.size);
    }
    const n = Math.max(1, this.altKeys.size);
    this.altCount = new Int32Array(n);
    this.altStamp = new Int32Array(n).fill(-1);
    this.altCur = new Int32Array(n);
    this.window = Math.max(OVERCLOCK_WINDOW, 1.5 * pulsePeriod);
  }

  /** Per step, before the pulses: advances the clock and releases the shots whose delay is over. */
  update(dt: number, shipX: number, shipY: number) {
    this.time += dt;
    if (this.dqN === 0) return;
    for (let k = this.dqN - 1; k >= 0; k--) {
      if (this.dqT[k] <= this.time) {
        this.spawn(this.dqR[k], this.dqD[k], shipX, shipY);
        this.fx.delayReleases++;
        const last = --this.dqN;
        this.dqT[k] = this.dqT[last]; this.dqR[k] = this.dqR[last]; this.dqD[k] = this.dqD[last];
      }
    }
  }

  /** Drops every held shot and all stage state (a restarted run). */
  reset() {
    this.dqN = 0;
    this.time = 0;
    this.pulseNo = 0;
    for (const a of this.st) a.fill(0);
    this.altCount.fill(0);
    this.altStamp.fill(-1);
  }

  /** One pulse from (shipX, shipY): one projectile per recipe that fires on it (see the class comment). */
  fire(shipX: number, shipY: number) {
    this.pulseNo++;
    for (let ri = 0; ri < this.recipes.length; ri++) {
      const r = this.recipes[ri];
      let damage: number;
      let delay = 0;
      if (!this.dyn[ri]) {
        // Chance blocks (Lucky Strike, Jackpot, Gambler's Gate) are rolled per projectile.
        damage = r.packet.damage;
        if (r.packet.gates.length > 0) {
          damage = evalDamage(r.packet, () => rng.combat.next());
          if (damage <= 0) continue;
        }
      } else {
        damage = this.evalDynamic(ri);
        if (damage <= 0) continue;
        delay = this.curDelay;
      }
      if (delay > 0 && this.dqN < DELAY_CAP) {
        const k = this.dqN++;
        this.dqT[k] = this.time + delay;
        this.dqR[k] = ri;
        this.dqD[k] = damage;
        this.fx.delayedShots++;
      } else {
        this.spawn(ri, damage, shipX, shipY);
      }
    }
    // Alternators that were reached this pulse hand the next packet to their other output.
    for (let k = 0; k < this.altStamp.length; k++) {
      if (this.altStamp[k] === this.pulseNo) {
        this.altCount[k]++;
        if (this.altCount[k] > 1) this.fx.alternations++;
      }
    }
  }

  private curDelay = 0;

  /** Walks a recipe's stages in path order for this pulse. Returns the damage to fire, or 0 when nothing leaves. */
  private evalDynamic(ri: number): number {
    const ops = this.recipes[ri].packet.ops;
    const st = this.st[ri];
    let d = 1;
    this.curDelay = 0;
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      switch (op.t) {
        case 'add': d += op.v; break;
        case 'mul': d *= op.v; break;
        case 'gate': d *= rng.combat.next() < op.gate.prob ? op.gate.mult : op.gate.elseMult; break;
        case 'oc': {
          const o = k * 3;
          if (st[o + 1] > 0 && this.time - st[o + 1] > this.window) { st[o] = 0; this.fx.overclockResets++; }
          const mult = 1 + Math.min(op.cap, op.gain * st[o]);
          st[o]++;
          st[o + 1] = this.time || 1e-9;
          d *= mult;
          if (mult > this.fx.overclockPeak) this.fx.overclockPeak = mult;
          break;
        }
        case 'cap': {
          const o = k * 3;
          st[o] += d;
          st[o + 1]++;
          if (st[o + 1] < op.n) { this.fx.capacitorAbsorbed++; return 0; }
          d = st[o] * op.mul;
          st[o] = 0;
          st[o + 1] = 0;
          this.fx.capacitorEmits++;
          break;
        }
        case 'alt': {
          const ki = this.altKeys.get(op.key) as number;
          if (this.altStamp[ki] !== this.pulseNo) { this.altStamp[ki] = this.pulseNo; this.altCur[ki] = this.altCount[ki]; }
          if (this.altCur[ki] % op.of !== op.branch) return 0;
          break;
        }
        case 'delay': this.curDelay += op.sec; break;
      }
      if (d <= 0 && op.t !== 'cap') return 0;
    }
    return d;
  }

  private spawn(ri: number, damage: number, shipX: number, shipY: number) {
    const r = this.recipes[ri];
    const speed = PROJECTILE_SPEED * (r.packet.speedMul || 1);
    let vx = 0;
    let vy = 0;
    if (r.direction === 'N') vy = -speed;
    else if (r.direction === 'S') vy = speed;
    else if (r.direction === 'E') vx = speed;
    else vx = -speed;
    const off = this.offsets[ri];
    const i = this.pool.spawn(shipX + off.x, shipY + off.y, vx, vy, damage, r.packet.pure || 0, ri);
    if (i >= 0) {
      this.projSys.shipX = shipX;
      this.projSys.shipY = shipY;
      this.projSys.init(i);
    }
  }
}

/**
 * Fire one stateless pulse from (shipX, shipY): one projectile per compiled ejector recipe. Kept for callers that have no
 * Gun; circuits with stateful blocks need a Gun.
 */
export function firePulse(
  pool: ProjectilePool, projSys: ProjectileSystem, recipes: EjectorRecipe[],
  offsets: { x: number; y: number }[], shipX: number, shipY: number,
) {
  new Gun(pool, projSys, recipes, offsets).fire(shipX, shipY);
}
