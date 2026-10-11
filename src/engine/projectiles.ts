import { rng } from '../rng';
import { ProjectilePool } from './pools';
import { Modifier } from './compilerTypes';
import { SpatialHash } from './spatialHash';
import { EnemyStats, applyDamage, DamageResult } from './damage';
import { EnemyField, TargetField } from './targets';
import {
  BOOMERANG_CATCH, boomerangRange, BURN_TICK, CHAIN_FRAC, CHAIN_RANGE, CHAIN_ARC_LIFE, chainJumps, corrosionCap, CORROSION_STEP,
  executionerMul, EXECUTIONER_BELOW, frostBonus, frostSlow, frostTime, igniteFrac, IGNITE_TIME, mineDistance, MINE_SIZE, MINE_WAIT,
  orbitTime, ORBIT_OPEN, ORBIT_RADIUS, ORBIT_REHIT,
} from './effects';
import { RING } from './pools';

export interface EnemyEntity extends EnemyStats {
  id: number;
  x: number;
  y: number;
  radius: number;
  // Status effects (chunk 9a). All optional: absent means "none". Rocks and wall blocks both carry them.
  /** Burn: seconds left, damage per second, time banked towards the next tick. */
  burnT?: number;
  burnDps?: number;
  burnTick?: number;
  /** Frozen: seconds left, drift slowdown (0..1) and extra damage taken (0.25 = +25%). */
  freezeT?: number;
  freezeSlow?: number;
  freezeBonus?: number;
  /** Armor before Corrosion touched it (set by the first corrosive hit). */
  armor0?: number;
  /** Already in the status list. */
  tracked?: boolean;
}

/** How a hit reached the callback: a projectile hit, a burn tick or a chain jump. */
export const HIT_NORMAL = 0;
export const HIT_BURN = 1;
export const HIT_CHAIN = 2;
export type HitCallback = (enemy: EnemyEntity, hpDamage: number, x: number, y: number, kind?: number) => void;

/** Movement phases of Orbit / Boomerang / Mine projectiles (pool.phase). */
export const PHASE_NORMAL = 0;
export const PHASE_ORBIT = 1;
export const PHASE_BOOM_OUT = 2;
export const PHASE_BOOM_BACK = 3;
export const PHASE_MINE_TRAVEL = 4;
export const PHASE_MINE_WAIT = 5;

/** Short chain-lightning arcs: a fixed ring of lines the screens draw while their time is above 0. */
export const ARC_MAX = 48;

/** Counters of what the effect blocks did (debug hook and tests). */
export interface EffectCounters {
  chainJumps: number;
  boomerangReturns: number;
  orbitLaunches: number;
  mineDetonations: number;
  mineExpired: number;
  igniteApplied: number;
  burnTicks: number;
  corrosionStrips: number;
  freezeApplied: number;
  frozenBonusHits: number;
  executionerHits: number;
}

/** Base hit radius of a projectile (scaled by the pool's size). */
export const PROJECTILE_RADIUS = 10;
/** Steering constants of the path modifiers (rates are degrees per second at block level 1 and scale with level). */
export const CURVE_RATE_DEG = 90;
export const HOMING_RATE_DEG = 180;
export const HOMING_RANGE = 400;
/** Total opening angle of the homing cone, centred on the heading. */
export const HOMING_CONE_DEG = 60;
export const RANDOM_CURVE_MAX_DEG = 120;
/** Random Curve turn rate at a block level: 120 deg/s at level 1, +25% per level. */
export const randomCurveMaxDeg = (level: number) => RANDOM_CURVE_MAX_DEG * (1 + 0.25 * (level - 1));
/** Seconds between new random-curve noise targets. */
export const RANDOM_CURVE_PERIOD = 0.35;
export const AOE_RECT_W = 160;
export const AOE_RECT_H = 24;
export const FORK_ANGLE_DEG = 35;
export const FORK_SIZE = 0.6;

const RAD = Math.PI / 180;
const smooth = (t: number) => t * t * (3 - 2 * t);

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Armor-Piercer damage multiplier at a block level: x2 at level 1. */
export const armorPierceMul = (level: number) => 1 + level;
export const aoeRectSize = (level: number) => ({ w: AOE_RECT_W + 40 * (level - 1), h: AOE_RECT_H + 6 * (level - 1) });
/** Piercing: each hit costs 1/level of the damage dealt. */
export const pierceCostMul = (level: number) => 1 / level;
/** Bouncing: every ricochet adds 10% damage per level above 1. */
export const bounceDamageMul = (level: number) => 1 + 0.1 * (level - 1);
/** AoE - Circle blast radius in px: 50 at level 1, +10 per level. */
export const aoeCircleRadius = (level: number) => 50 + 10 * (level - 1);
/** Shield-Breaker direct-damage multiplier: x1.5 at level 1, +0.5 per level. */
export const shieldBreakMul = (level: number) => 1 + 0.5 * level;
export const forkDamageFrac = (level: number) => 0.5 + 0.1 * (level - 1);

export class ProjectileSystem {
  pool: ProjectilePool;

  modifiersTable: Modifier[][] = [];

  /** Scratch lists reused by every projectile (no per-shot allocation). */
  private near: EnemyEntity[] = [];
  private blast: EnemyEntity[] = [];
  private chainBuf: EnemyEntity[] = [];
  private chainSeen: number[] = [];
  /** Targets with a live burn or freeze (swap-removed when both end). */
  private affected: EnemyEntity[] = [];
  /** Seconds of steer() time so far: Orbit's per-target re-hit timers compare against it. */
  private clock = 0;

  /** Where the ship is: Orbit circles it and Boomerang returns to it. Set by the world before steer(). */
  shipX = 0;
  shipY = 0;

  /** Chain-lightning arcs (a ring): from, to, seconds left. */
  readonly arcX0 = new Float32Array(ARC_MAX);
  readonly arcY0 = new Float32Array(ARC_MAX);
  readonly arcX1 = new Float32Array(ARC_MAX);
  readonly arcY1 = new Float32Array(ARC_MAX);
  readonly arcT = new Float32Array(ARC_MAX);
  private arcNext = 0;

  readonly fx: EffectCounters = {
    chainJumps: 0, boomerangReturns: 0, orbitLaunches: 0, mineDetonations: 0, mineExpired: 0, igniteApplied: 0, burnTicks: 0,
    corrosionStrips: 0, freezeApplied: 0, frozenBonusHits: 0, executionerHits: 0,
  };

  /** Levels of the effect modifiers on the projectile being processed (0 = absent); one reused object. */
  private mi = { chain: 0, boomerang: 0, orbit: 0, mine: 0, ignite: 0, corrosion: 0, frostbite: 0, executioner: 0 };

  /** Optional hook fired once per enemy damaged (used for hit flash / damage numbers). */
  onHit: HitCallback | null = null;

  constructor(pool: ProjectilePool) {
    this.pool = pool;
  }

  private modsOf(i: number): Modifier[] {
    return this.modifiersTable[this.pool.modIndex[i]] || [];
  }

  /** Called once right after a projectile is spawned: seeds the random-curve noise from the combat RNG stream. */
  init(i: number) {
    const mods = this.modsOf(i);
    if (mods.some(m => m.type === 'random_curve')) {
      this.pool.aux1[i] = rng.combat.next() * 2 - 1;
      this.pool.aux2[i] = rng.combat.next() * 2 - 1;
      this.pool.aux3[i] = 0;
    }
    // Movement phases: Orbit first, then (or instead) Mine or Boomerang. Fork copies fly plain.
    const pool = this.pool;
    if (pool.copy[i]) return;
    const mi = this.scan(mods);
    if (mi.orbit || mi.mine || mi.boomerang) {
      pool.s3[i] = Math.hypot(pool.vx[i], pool.vy[i]);
      pool.s2[i] = 0;
      if (mi.orbit) { pool.phase[i] = PHASE_ORBIT; pool.s1[i] = Math.atan2(pool.vy[i], pool.vx[i]); }
      else { pool.s1[i] = 0; pool.phase[i] = mi.mine ? PHASE_MINE_TRAVEL : PHASE_BOOM_OUT; }
    }
  }

  /** Reads the effect levels off a modifier list into the reused `mi` object. */
  private scan(mods: Modifier[]) {
    const mi = this.mi;
    mi.chain = mi.boomerang = mi.orbit = mi.mine = mi.ignite = mi.corrosion = mi.frostbite = mi.executioner = 0;
    for (const m of mods) {
      switch (m.type) {
        case 'chain_lightning': mi.chain = m.level ?? 1; break;
        case 'boomerang': mi.boomerang = m.level ?? 1; break;
        case 'orbit': mi.orbit = m.level ?? 1; break;
        case 'mine': mi.mine = m.level ?? 1; break;
        case 'ignite': mi.ignite = m.level ?? 1; break;
        case 'corrosion': mi.corrosion = m.level ?? 1; break;
        case 'frostbite': mi.frostbite = m.level ?? 1; break;
        case 'executioner': mi.executioner = m.level ?? 1; break;
      }
    }
    return mi;
  }

  /**
   * Orbit / Boomerang / Mine movement of one projectile. It sets the velocity so the world's `x += v * dt` lands where
   * the phase wants the projectile (Orbit: a point on the circle round the ship).
   */
  private stepPhase(i: number, dt: number) {
    const pool = this.pool;
    const ph = pool.phase[i];
    const mi = this.scan(this.modsOf(i));
    const speed = pool.s3[i];
    if (ph === PHASE_ORBIT) {
      pool.s2[i] += dt;
      const t = pool.s2[i];
      if (t >= orbitTime(mi.orbit)) {
        const a = pool.s1[i];
        pool.vx[i] = Math.cos(a) * speed;
        pool.vy[i] = Math.sin(a) * speed;
        pool.age[i] = 0;
        pool.s1[i] = 0;
        pool.s2[i] = 0;
        pool.phase[i] = mi.mine ? PHASE_MINE_TRAVEL : mi.boomerang ? PHASE_BOOM_OUT : PHASE_NORMAL;
        this.fx.orbitLaunches++;
        return;
      }
      const r = ORBIT_RADIUS * Math.min(1, t / ORBIT_OPEN);
      const th = pool.s1[i] + (speed / ORBIT_RADIUS) * t;
      pool.vx[i] = (this.shipX + Math.cos(th) * r - pool.x[i]) / dt;
      pool.vy[i] = (this.shipY + Math.sin(th) * r - pool.y[i]) / dt;
    } else if (ph === PHASE_BOOM_OUT) {
      pool.s1[i] += Math.hypot(pool.vx[i], pool.vy[i]) * dt;
      if (pool.s1[i] >= boomerangRange(mi.boomerang)) {
        pool.phase[i] = PHASE_BOOM_BACK;
        pool.skipId[i] = -1; // the way back may hit what the way out hit
        pool.age[i] = 0;
      }
    } else if (ph === PHASE_BOOM_BACK) {
      const dx = this.shipX - pool.x[i];
      const dy = this.shipY - pool.y[i];
      const d = Math.hypot(dx, dy);
      if (d <= Math.max(BOOMERANG_CATCH, speed * dt)) {
        this.fx.boomerangReturns++;
        pool.free(i);
        return;
      }
      pool.vx[i] = (dx / d) * speed;
      pool.vy[i] = (dy / d) * speed;
      pool.age[i] = 0;
    } else if (ph === PHASE_MINE_TRAVEL) {
      pool.s1[i] += Math.hypot(pool.vx[i], pool.vy[i]) * dt;
      if (pool.s1[i] >= mineDistance(mi.mine)) {
        pool.vx[i] = 0;
        pool.vy[i] = 0;
        pool.s2[i] = 0;
        pool.size[i] = MINE_SIZE;
        pool.phase[i] = PHASE_MINE_WAIT;
      }
    } else if (ph === PHASE_MINE_WAIT) {
      pool.s2[i] += dt;
      pool.age[i] = 0; // a waiting mine is exempt from the wall's projectile age limit
      if (pool.s2[i] >= MINE_WAIT) { this.fx.mineExpired++; pool.free(i); }
    }
  }

  /** Path modifiers: curving, homing and random curve turn a projectile's velocity (speed is kept). */
  steer(dt: number, targets: EnemyEntity[] | TargetField) {
    const pool = this.pool;
    const field = Array.isArray(targets) ? null : targets;
    const near = this.near;
    this.clock += dt;
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      pool.age[i] += dt;
      if (pool.phase[i] !== PHASE_NORMAL && dt > 0) {
        this.stepPhase(i, dt);
        if (!pool.active[i]) continue;
        const ph = pool.phase[i];
        // These phases own the velocity: no curving or homing on top.
        if (ph === PHASE_ORBIT || ph === PHASE_BOOM_BACK || ph === PHASE_MINE_WAIT) continue;
      }
      const mods = this.modsOf(i);
      if (mods.length === 0) continue;
      let turn = 0; // radians per second, clockwise on screen
      for (const m of mods) {
        if (m.type === 'curve' && m.dir === 'right') turn += CURVE_RATE_DEG * (m.level ?? 1) * RAD;
        else if (m.type === 'random_curve') {
          let phase = pool.aux3[i] + dt / RANDOM_CURVE_PERIOD;
          while (phase >= 1) {
            phase -= 1;
            pool.aux1[i] = pool.aux2[i];
            pool.aux2[i] = rng.combat.next() * 2 - 1;
          }
          pool.aux3[i] = phase;
          const v = pool.aux1[i] + (pool.aux2[i] - pool.aux1[i]) * smooth(phase);
          turn += v * randomCurveMaxDeg(m.level ?? 1) * RAD;
        }
      }
      const homing = mods.find(m => m.type === 'homing');
      let rotate = turn * dt;
      if (homing) {
        const vx = pool.vx[i];
        const vy = pool.vy[i];
        const heading = Math.atan2(vy, vx);
        let best = HOMING_RANGE * HOMING_RANGE;
        let bestDiff = 0;
        let found = false;
        if (field) field.collectNear(pool.x[i], pool.y[i], HOMING_RANGE, near);
        for (const e of field ? near : (targets as EnemyEntity[])) {
          if (e.hp <= 0) continue;
          const dx = e.x - pool.x[i];
          const dy = e.y - pool.y[i];
          const d2 = dx * dx + dy * dy;
          if (d2 > best) continue;
          const diff = wrapAngle(Math.atan2(dy, dx) - heading);
          if (Math.abs(diff) > (HOMING_CONE_DEG / 2) * RAD) continue;
          best = d2;
          bestDiff = diff;
          found = true;
        }
        if (found) {
          const maxStep = HOMING_RATE_DEG * (homing.level ?? 1) * RAD * dt;
          rotate += Math.max(-maxStep, Math.min(maxStep, bestDiff));
        }
      }
      if (rotate !== 0) {
        const c = Math.cos(rotate);
        const s = Math.sin(rotate);
        const vx = pool.vx[i];
        const vy = pool.vy[i];
        pool.vx[i] = vx * c - vy * s;
        pool.vy[i] = vx * s + vy * c;
      }
    }
  }

  /** Free Fly: rocks found through the spatial hash. */
  processHits(enemies: EnemyEntity[], spatial: SpatialHash, tier: number) {
    this.processField(new EnemyField(enemies, spatial), tier);
  }

  /** The one hit pipeline: every projectile against any set of targets (rocks or wall blocks). */
  processField(field: TargetField, tier: number) {
    const blast = this.blast;
    for (let i = 0; i < this.pool.max; i++) {
      if (!this.pool.active[i]) continue;

      const px = this.pool.x[i];
      const py = this.pool.y[i];
      const damage = this.pool.damage[i];
      const pure = this.pool.pure[i];
      const mods = this.modsOf(i);

      const pierceMod = mods.find(m => m.type === 'piercing');
      const isPiercing = !!pierceMod;
      const bounceMod = mods.find(m => m.type === 'bouncing');
      const isBouncing = !!bounceMod;
      const aoeMod = mods.find(m => m.type === 'aoe_circle');
      const rectMod = mods.find(m => m.type === 'aoe_rect');
      const forkMod = mods.find(m => m.type === 'fork_impact');
      const apMod = mods.find(m => m.type === 'armor_piercer');
      const armorPierce = apMod ? armorPierceMul(apMod.level ?? 1) : 0;
      const sbMod = mods.find(m => m.type === 'shield_breaker');
      const isShieldBreaker = sbMod ? shieldBreakMul(sbMod.level ?? 1) : false;
      const hitR = PROJECTILE_RADIUS * this.pool.size[i];

      const mi = this.scan(mods);
      const phase = this.pool.phase[i];
      let target: EnemyEntity | null = null;
      if (phase === PHASE_ORBIT) {
        // An orbiting projectile may touch several targets at once: take the first one not hit within ORBIT_REHIT seconds.
        field.collectCircle(px, py, hitR, blast);
        for (const c of blast) {
          if (c.hp > 0 && !this.ringBlocked(i, c.id)) { target = c; break; }
        }
      } else {
        target = field.hitCircle(px, py, hitR, this.pool.skipId[i]);
      }
      if (!target) continue;
      if (phase === PHASE_MINE_WAIT) this.fx.mineDetonations++;

      if (aoeMod) {
        const radius = aoeMod.radius || aoeCircleRadius(aoeMod.level ?? 1);
        field.collectCircle(px, py, radius, blast);
        for (const ce of blast) {
          if (ce.hp <= 0) continue;
          this.strike(ce, damage, pure, tier, armorPierce, isShieldBreaker, mi, ce.x, ce.y, HIT_NORMAL);
        }
        if (mi.chain) this.chain(field, target, damage, pure, tier, armorPierce, isShieldBreaker, mi);
        this.pool.free(i); // AoE detonates
      } else if (rectMod) {
        // Detonates as a horizontal bar centred on the hit: full damage once to every target it overlaps.
        const { w, h } = aoeRectSize(rectMod.level ?? 1);
        field.collectRect(px, py, w, h, blast);
        for (const ce of blast) {
          if (ce.hp <= 0) continue;
          this.strike(ce, damage, pure, tier, armorPierce, isShieldBreaker, mi, ce.x, ce.y, HIT_NORMAL);
        }
        if (mi.chain) this.chain(field, target, damage, pure, tier, armorPierce, isShieldBreaker, mi);
        this.pool.free(i);
      } else {
        // Normal hit
        const res = this.strike(target, damage, pure, tier, armorPierce, isShieldBreaker, mi, px, py, HIT_NORMAL);
        if (mi.chain) this.chain(field, target, damage, pure, tier, armorPierce, isShieldBreaker, mi);

        if (forkMod && !this.pool.copy[i]) this.fork(i, target.id, forkMod.level ?? 1);

        if (phase === PHASE_ORBIT) {
          this.ringAdd(i, target.id); // orbiting: hits, and keeps going
        } else if (phase === PHASE_BOOM_OUT || phase === PHASE_BOOM_BACK) {
          this.pool.skipId[i] = target.id; // a boomerang flies on through what it hit; each leg hits a target once
        } else if (isBouncing && target.armor > 0) {
          // Bounce: keep full damage. Off a surface the field knows, reflect; otherwise pick a new direction.
          this.pool.damage[i] *= bounceDamageMul(bounceMod!.level ?? 1);
          const info = field.bounceInfo ? field.bounceInfo(target, px, py, hitR) : null;
          if (info) {
            const vn = this.pool.vx[i] * info.nx + this.pool.vy[i] * info.ny;
            if (vn < 0) {
              this.pool.vx[i] -= 2 * vn * info.nx;
              this.pool.vy[i] -= 2 * vn * info.ny;
            }
            this.pool.x[i] += info.nx * info.push;
            this.pool.y[i] += info.ny * info.push;
          } else {
            const speed = Math.sqrt(this.pool.vx[i]**2 + this.pool.vy[i]**2) || 200;
            const angle = rng.combat.next() * Math.PI * 2;
            this.pool.vx[i] = Math.cos(angle) * speed;
            this.pool.vy[i] = Math.sin(angle) * speed;
            // Advance slightly to avoid re-colliding immediately.
            this.pool.x[i] += this.pool.vx[i] * 0.1;
            this.pool.y[i] += this.pool.vy[i] * 0.1;
          }
        } else if (isPiercing) {
          const damageSpent = res.hpDamage; // actual hp taken
          const drop = Math.max(damage * 0.1, damageSpent) * pierceCostMul(pierceMod!.level ?? 1);
          this.pool.damage[i] -= drop;
          if (this.pool.damage[i] <= 0) {
            this.pool.free(i);
          }
        } else {
          this.pool.free(i); // Destroy on hit
        }
      }
    }
  }

  // ------------------------------------------------------------------ orbit: recently hit targets
  private ringBlocked(i: number, id: number): boolean {
    const pool = this.pool;
    const n = pool.ringN[i];
    const base = i * RING;
    for (let k = 0; k < n; k++) {
      if (pool.ringId[base + k] === id && this.clock - pool.ringT[base + k] < ORBIT_REHIT) return true;
    }
    return false;
  }

  private ringAdd(i: number, id: number) {
    const pool = this.pool;
    const base = i * RING;
    const n = pool.ringN[i];
    // Reuse the entry of this target, else the next free slot, else overwrite the oldest.
    let slot = -1;
    let oldest = 0;
    for (let k = 0; k < n; k++) {
      if (pool.ringId[base + k] === id) { slot = k; break; }
      if (pool.ringT[base + k] < pool.ringT[base + oldest]) oldest = k;
    }
    if (slot < 0) {
      if (n < RING) { slot = n; pool.ringN[i] = n + 1; } else slot = oldest;
    }
    pool.ringId[base + slot] = id;
    pool.ringT[base + slot] = this.clock;
  }

  // ------------------------------------------------------------------ damage and status
  /**
   * One target takes one hit: Executioner and frozen bonuses, armor/shield maths (applyDamage), the hit callback, then the
   * statuses of the projectile (Ignite, Frostbite, Corrosion). Every damage source of the pipeline goes through here.
   */
  private strike(
    t: EnemyEntity, dmg: number, pure: number, tier: number, armorPierce: number, shieldBreaker: number | boolean,
    mi: { ignite: number; frostbite: number; corrosion: number; executioner: number },
    x: number, y: number, kind: number,
  ): DamageResult {
    let d = dmg;
    if (mi.executioner && t.hp < t.maxHp * EXECUTIONER_BELOW) { d *= executionerMul(mi.executioner); this.fx.executionerHits++; }
    if ((t.freezeT ?? 0) > 0) { d *= 1 + (t.freezeBonus ?? 0); this.fx.frozenBonusHits++; }
    const res = applyDamage(t, d, pure, tier, armorPierce, shieldBreaker);
    if (this.onHit) this.onHit(t, res.hpDamage, x, y, kind);
    if (t.hp > 0) {
      if (mi.ignite) this.ignite(t, d * igniteFrac(mi.ignite));
      if (mi.frostbite) this.freeze(t, mi.frostbite);
    }
    if (mi.corrosion && t.armor > 0) this.corrode(t, mi.corrosion);
    return res;
  }

  private track(t: EnemyEntity) {
    if (!t.tracked) { t.tracked = true; this.affected.push(t); }
  }

  /** Burn: refreshes the timer, keeps the stronger of the two rates (never stacks). */
  private ignite(t: EnemyEntity, dps: number) {
    t.burnT = IGNITE_TIME;
    if (dps > (t.burnDps ?? 0)) t.burnDps = dps;
    if (t.burnTick === undefined) t.burnTick = 0;
    this.fx.igniteApplied++;
    this.track(t);
  }

  private freeze(t: EnemyEntity, level: number) {
    const time = frostTime(level);
    if (time > (t.freezeT ?? 0)) t.freezeT = time;
    if (frostSlow(level) > (t.freezeSlow ?? 0)) t.freezeSlow = frostSlow(level);
    if (frostBonus(level) > (t.freezeBonus ?? 0)) t.freezeBonus = frostBonus(level);
    this.fx.freezeApplied++;
    this.track(t);
  }

  /** Corrosion: 5% of the remaining armor per hit, never below (1 - cap) of the original. */
  private corrode(t: EnemyEntity, level: number) {
    if (t.armor0 === undefined) t.armor0 = t.armor;
    const floor = t.armor0 * (1 - corrosionCap(level));
    const next = Math.max(floor, t.armor * (1 - CORROSION_STEP));
    if (next < t.armor) { t.armor = next; this.fx.corrosionStrips++; }
  }

  private addArc(x0: number, y0: number, x1: number, y1: number) {
    const k = this.arcNext;
    this.arcNext = (k + 1) % ARC_MAX;
    this.arcX0[k] = x0; this.arcY0[k] = y0; this.arcX1[k] = x1; this.arcY1[k] = y1;
    this.arcT[k] = CHAIN_ARC_LIFE;
  }

  /** Chain Lightning: from the target that was hit, jump to the nearest unhit living target in range, up to the level's count. */
  private chain(
    field: TargetField, origin: EnemyEntity, damage: number, pure: number, tier: number, armorPierce: number,
    shieldBreaker: number | boolean, mi: { chain: number; ignite: number; frostbite: number; corrosion: number; executioner: number },
  ) {
    const seen = this.chainSeen;
    const buf = this.chainBuf;
    seen.length = 0;
    seen.push(origin.id);
    let cur = origin;
    const jumps = chainJumps(mi.chain);
    for (let j = 0; j < jumps; j++) {
      field.collectCircle(cur.x, cur.y, CHAIN_RANGE, buf);
      let best: EnemyEntity | null = null;
      let bestD = CHAIN_RANGE * CHAIN_RANGE;
      for (const c of buf) {
        if (c.hp <= 0 || seen.includes(c.id)) continue;
        const d2 = (c.x - cur.x) ** 2 + (c.y - cur.y) ** 2;
        if (d2 <= bestD) { bestD = d2; best = c; }
      }
      if (!best) break;
      seen.push(best.id);
      this.addArc(cur.x, cur.y, best.x, best.y);
      this.strike(best, damage * CHAIN_FRAC, pure, tier, armorPierce, shieldBreaker, mi, best.x, best.y, HIT_CHAIN);
      this.fx.chainJumps++;
      cur = best;
    }
  }

  /** Per step: arc lifetimes, burn ticks and freeze timers. Call once per update, before the hits of that step. */
  updateStatus(dt: number) {
    for (let k = 0; k < ARC_MAX; k++) if (this.arcT[k] > 0) this.arcT[k] -= dt;
    const list = this.affected;
    for (let k = list.length - 1; k >= 0; k--) {
      const t = list[k];
      if (t.hp > 0) {
        if ((t.freezeT ?? 0) > 0) {
          t.freezeT = (t.freezeT as number) - dt;
          if (t.freezeT <= 0) { t.freezeT = 0; t.freezeSlow = 0; t.freezeBonus = 0; }
        }
        if ((t.burnT ?? 0) > 0) {
          const step = Math.min(dt, t.burnT as number);
          t.burnT = (t.burnT as number) - dt;
          t.burnTick = (t.burnTick ?? 0) + step;
          while ((t.burnTick as number) >= BURN_TICK - 1e-9 && t.hp > 0) {
            t.burnTick = (t.burnTick as number) - BURN_TICK;
            this.burn(t, (t.burnDps ?? 0) * BURN_TICK);
          }
          if (t.burnT <= 0) {
            // Burn over: pay the part of a tick that is left, so the total is exactly rate x duration.
            if ((t.burnTick as number) > 1e-6 && t.hp > 0) this.burn(t, (t.burnDps ?? 0) * (t.burnTick as number));
            t.burnT = 0; t.burnDps = 0; t.burnTick = 0;
          }
        }
      }
      if (t.hp <= 0 || ((t.burnT ?? 0) <= 0 && (t.freezeT ?? 0) <= 0)) {
        t.tracked = false;
        list[k] = list[list.length - 1];
        list.pop();
      }
    }
  }

  private burn(t: EnemyEntity, dmg: number) {
    const d = (t.freezeT ?? 0) > 0 ? dmg * (1 + (t.freezeBonus ?? 0)) : dmg;
    const taken = Math.min(Math.max(0, t.hp), d);
    t.hp -= d;
    this.fx.burnTicks++;
    if (this.onHit) this.onHit(t, taken, t.x, t.y, HIT_BURN);
  }

  /** Two copies at a fraction of the damage and 0.6x size, +/- 35 degrees off the heading. They cannot fork again. */
  private fork(i: number, enemyId: number, level: number) {
    const pool = this.pool;
    const speed = Math.hypot(pool.vx[i], pool.vy[i]);
    const heading = Math.atan2(pool.vy[i], pool.vx[i]);
    const dmg = pool.damage[i] * forkDamageFrac(level);
    for (const sign of [-1, 1]) {
      const a = heading + sign * FORK_ANGLE_DEG * RAD;
      const j = pool.spawn(pool.x[i], pool.y[i], Math.cos(a) * speed, Math.sin(a) * speed, dmg, pool.pure[i], pool.modIndex[i]);
      if (j < 0) continue;
      pool.size[j] = pool.size[i] * FORK_SIZE;
      pool.copy[j] = 1;
      pool.skipId[j] = enemyId;
      this.init(j);
    }
  }
}
