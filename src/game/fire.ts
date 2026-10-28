import { EjectorRecipe, Grid } from '../engine/compiler';
import { evalDamage, isDynamic, mulSafe } from '../engine/compilerTypes';
import { FUSE_N, loneShotMul, MIRROR_OFFSET, OVERCLOCK_WINDOW } from '../engine/effects';
import { ProjectilePool } from '../engine/pools';
import { ProjectileSystem } from '../engine/projectiles';
import { rng } from '../rng';
import { FIRE_OFFSET_SCALE, PROJECTILE_MAX_AGE } from '../wall/constants';

export const PROJECTILE_SPEED = 600;
const RAD = Math.PI / 180;
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
  /** Random Router pulses: how many picked a single output and how many took both. */
  routerSingle: number;
  routerBoth: number;
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
  /** Projectiles fired so far (read by the sound layer; no effect on play). */
  shots = 0;
  /** Captain effect: every projectile's speed is multiplied by this (1 = none). */
  speedMul = 1;
  readonly fx: GunCounters = {
    alternations: 0, routerSingle: 0, routerBoth: 0, capacitorAbsorbed: 0, capacitorEmits: 0, delayedShots: 0, delayReleases: 0, overclockPeak: 1, overclockResets: 0,
  };

  private readonly dyn: boolean[];
  /** Per recipe: 3 numbers per op (Overclock: streak, last time; Capacitor: bank, count). */
  private readonly st: Float64Array[];
  /** Alternator counters, by block cell key: how many pulses have passed through it. */
  private readonly altKeys = new Map<number, number>();
  private readonly altCount: Int32Array;
  private readonly altStamp: Int32Array;
  private readonly altCur: Int32Array;
  /** Rebound (chunk 20a), by block cell key: the damage the previous shot arrived with and whether there was one. */
  private readonly rebPrev: Float64Array;
  private readonly rebHas: Uint8Array;
  /** Per recipe: its line has a Mirror block (every shot gets a clone beside it). */
  private readonly mirror: boolean[];
  /** Random Router: the pulse each router last picked on and what it picked (-1 = both outputs). */
  private readonly rndStamp: Int32Array;
  private readonly rndChoice: Int32Array;
  private pulseNo = 0;
  /** Overclock streaks reset after this long without a packet: 1 s, or 1.5 pulse periods on a slow hull. */
  private readonly window: number;

  // Delay queue (struct of arrays, no allocation per shot).
  private dqT = new Float64Array(DELAY_CAP);
  private dqR = new Int16Array(DELAY_CAP);
  private dqD = new Float64Array(DELAY_CAP);
  private dqN = 0;

  constructor(
    private pool: ProjectilePool, private projSys: ProjectileSystem, private recipes: EjectorRecipe[],
    private offsets: { x: number; y: number }[], pulsePeriod = 0.25,
  ) {
    this.dyn = recipes.map(r => isDynamic(r.packet));
    this.st = recipes.map(r => new Float64Array(Math.max(1, r.packet.ops.length) * 3));
    for (const r of recipes) {
      for (const op of r.packet.ops) if ((op.t === 'alt' || op.t === 'rnd' || op.t === 'rebound') && !this.altKeys.has(op.key)) this.altKeys.set(op.key, this.altKeys.size);
    }
    this.mirror = recipes.map(r => r.packet.mods.some(m => m.type === 'mirror'));
    const n = Math.max(1, this.altKeys.size);
    this.altCount = new Int32Array(n);
    this.altStamp = new Int32Array(n).fill(-1);
    this.altCur = new Int32Array(n);
    this.rndStamp = new Int32Array(n).fill(-1);
    this.rndChoice = new Int32Array(n);
    this.rebPrev = new Float64Array(n);
    this.rebHas = new Uint8Array(n);
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
    this.rndStamp.fill(-1);
    this.rebHas.fill(0);
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
        }
      } else {
        damage = this.evalDynamic(ri);
        delay = this.curDelay;
      }
      // Zero, negative or NaN: nothing leaves (chunk 16c-2; `damage <= 0` is false for NaN, so the test is written the other way).
      if (!(damage > 0)) continue;
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
    let d = this.recipes[ri].packet.base;
    this.curDelay = 0;
    for (let k = 0; k < ops.length; k++) {
      const op = ops[k];
      switch (op.t) {
        case 'add': d += op.v; break;
        case 'mul': d *= op.v; break;
        case 'gate': d = mulSafe(d, rng.combat.next() < op.gate.prob ? op.gate.mult : op.gate.elseMult); break;
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
          if (Number.isNaN(d)) return 0;
          st[o] += d;
          st[o + 1]++;
          if (st[o + 1] < op.n) { this.fx.capacitorAbsorbed++; return 0; }
          d = st[o] * op.mul;
          st[o] = 0;
          st[o + 1] = 0;
          this.fx.capacitorEmits++;
          if (op.n === FUSE_N) this.projSys.fx.fuseEmits++;
          break;
        }
        case 'alt': {
          const ki = this.altKeys.get(op.key) as number;
          if (this.altStamp[ki] !== this.pulseNo) { this.altStamp[ki] = this.pulseNo; this.altCur[ki] = this.altCount[ki]; }
          if (this.altCur[ki] % op.of !== op.branch) return 0;
          break;
        }
        case 'rnd': {
          const ki = this.altKeys.get(op.key) as number;
          if (this.rndStamp[ki] !== this.pulseNo) {
            // One pick per router per pulse, shared by every recipe below it: both outputs, or one of them.
            this.rndStamp[ki] = this.pulseNo;
            if (op.both > 0 && rng.combat.next() < op.both) { this.rndChoice[ki] = -1; this.fx.routerBoth++; }
            else { this.rndChoice[ki] = Math.min(op.of - 1, Math.floor(rng.combat.next() * op.of)); this.fx.routerSingle++; }
          }
          const c = this.rndChoice[ki];
          if (c !== -1 && c !== op.branch) return 0;
          break;
        }
        case 'delay': this.curDelay += op.sec; break;
        case 'lone': {
          // Lone Shot: the fewer of the player's shots are alive, the harder this one hits (x2 alone, x1 from ten).
          const m = loneShotMul(this.pool.count);
          if (m > 1) this.projSys.fx.loneBoosts++;
          d *= m;
          break;
        }
        case 'rebound': {
          // Rebound: x4 when the shot before it through this block arrived with less damage. The comparison uses the damage arriving.
          const ki = this.altKeys.get(op.key) as number;
          const arriving = d;
          if (this.rebHas[ki] && this.rebPrev[ki] < arriving) { d *= op.mul; this.projSys.fx.reboundBonuses++; }
          this.rebPrev[ki] = arriving;
          this.rebHas[ki] = 1;
          break;
        }
      }
      if (!(d > 0) && op.t !== 'cap') return 0; // also drops NaN
    }
    return d;
  }

  private spawn(ri: number, damage: number, shipX: number, shipY: number) {
    const r = this.recipes[ri];
    const speed = PROJECTILE_SPEED * (r.packet.speedMul || 1) * this.speedMul;
    let vx = 0;
    let vy = 0;
    if (r.direction === 'N') vy = -speed;
    else if (r.direction === 'S') vy = speed;
    else if (r.direction === 'E') vx = speed;
    else vx = -speed;
    // Angle and Scatter (chunk 20b): the launch direction is turned by the packet's angle plus a random draw inside its Scatter cone.
    // The draw is made once, so a Mirror clone flies the same way as its shot.
    let aim = r.packet.angle || 0;
    if (r.packet.scatter > 0) aim += (rng.combat.next() * 2 - 1) * r.packet.scatter;
    if (aim !== 0) {
      const c = Math.cos(aim * RAD), sn = Math.sin(aim * RAD);
      const ux = vx, uy = vy;
      vx = ux * c - uy * sn;
      vy = ux * sn + uy * c;
    }
    const life = PROJECTILE_MAX_AGE * (r.packet.lifeMul || 1);
    const off = this.offsets[ri];
    const i = this.pool.spawn(shipX + off.x, shipY + off.y, vx, vy, damage, r.packet.pure || 0, ri);
    if (i >= 0) {
      this.pool.life[i] = life;
      this.pool.anchorX[i] = shipX;
      this.shots++;
      this.projSys.shipX = shipX;
      this.projSys.shipY = shipY;
      this.projSys.init(i);
      // Mirror: a clone beside the shot, same damage and modifiers. Made here and nowhere else, so it is never cloned again; a full pool skips it.
      if (this.mirror[ri]) {
        const c = this.pool.spawn(shipX + off.x + (-vy / speed) * MIRROR_OFFSET, shipY + off.y + (vx / speed) * MIRROR_OFFSET, vx, vy, damage, r.packet.pure || 0, ri);
        if (c >= 0) {
          this.pool.life[c] = life;
          this.pool.anchorX[c] = shipX;
          this.projSys.fx.mirrorClones++;
          this.projSys.init(c);
        }
      }
    }
  }
}
