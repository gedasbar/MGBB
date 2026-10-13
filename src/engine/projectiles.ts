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
  bounceCount, BOUNCE_SPREAD_DEG, cauterizeBonus, cauterizeTime, cleaverBonus, cleaverPenalty, CULLING_CAP, cullingPct,
  FRAGMENT_GENERATION, residueFrac, RESIDUE_RADIUS, RESIDUE_TICK, RESIDUE_TIME, spillFrac, STATIC_HITS, STATIC_WINDOW, staticFrac,
  WELL_TIME, wellPull,
} from './effects';
import { RING } from './pools';
import { wrapDx } from './wrap';

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
  // Chunk 11a. Present on Free Fly rocks (Mitosis blocks read and write them); absent on wall blocks.
  /** Rocks count generations from 1 (the parent). */
  generation?: number;
  /** Cauterize: seconds left in which the rock cannot split, and the credit bonus of a kill inside it. */
  cauterizedTimer?: number;
  cauterizeBonus?: number;
  /** Fission Catalyst: level of a hit that asked for a split (the world acts on it after the hits), and when this rock may be forced again. */
  fissionLevel?: number;
  fissionReady?: number;
  /** Overkill Spill: damage each child takes when this rock dies (a share of the killing hit), and the chain step it is at. */
  spillBurst?: number;
  spillDepth?: number;
  /** Static Charge: hits counted in the current window, and when the window began (projectile-system clock). */
  scN?: number;
  scFirst?: number;
}

/** How a hit reached the callback: a projectile hit, a burn tick or a chain jump. */
export const HIT_NORMAL = 0;
export const HIT_BURN = 1;
export const HIT_CHAIN = 2;
/** A Static Charge pulse (a normal hit with its own number) and a Residue Seed cloud tick (a quiet tick, like a burn). */
export const HIT_PULSE = 3;
export const HIT_CLOUD = 4;
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
/** Residue Seed clouds and Gravity Well attractors alive at once (a ring: the oldest is replaced). */
export const CLOUD_MAX = 32;
export const WELL_MAX = 16;

/** Levels of the effect modifiers on the projectile being processed (0 = absent). */
export interface EffectLevels {
  chain: number; boomerang: number; orbit: number; mine: number; ignite: number; corrosion: number; frostbite: number; executioner: number;
  fission: number; cauterize: number; cleaver: number; culling: number; residue: number; spill: number; gravity: number; staticCharge: number;
}

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
  // Chunk 11a
  bounces: number;
  edgeBounces: number;
  cleaverHits: number;
  cullingHits: number;
  residueClouds: number;
  residueTicks: number;
  wellsMade: number;
  staticPulses: number;
  cauterizeMarks: number;
  fissionMarks: number;
  spillMarks: number;
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
/** AoE - Circle blast radius in px: 50 at level 1, +10 per level. */
export const aoeCircleRadius = (level: number) => 50 + 10 * (level - 1);
/** Shield-Breaker direct-damage multiplier: x1.5 at level 1, +0.5 per level. */
export const shieldBreakMul = (level: number) => 1 + 0.5 * level;
export const forkDamageFrac = (level: number) => 0.5 + 0.1 * (level - 1);

export class ProjectileSystem {
  pool: ProjectilePool;

  modifiersTable: Modifier[][] = [];

  /** Ring walls: width of the ring in px, so homing takes the short way round; 0 (Free Fly, flat walls) keeps plain x maths. */
  wrapW = 0;

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
    bounces: 0, edgeBounces: 0, cleaverHits: 0, cullingHits: 0, residueClouds: 0, residueTicks: 0, wellsMade: 0, staticPulses: 0,
    cauterizeMarks: 0, fissionMarks: 0, spillMarks: 0,
  };

  /** Residue Seed clouds (a ring): position, seconds left, damage per tick, seconds since the last tick. Drawn by the screens. */
  readonly cloudX = new Float32Array(CLOUD_MAX);
  readonly cloudY = new Float32Array(CLOUD_MAX);
  readonly cloudT = new Float32Array(CLOUD_MAX);
  readonly cloudD = new Float32Array(CLOUD_MAX);
  private cloudTick = new Float32Array(CLOUD_MAX);
  private cloudNext = 0;
  /** Gravity Well attractors (a ring): position, seconds left, pull speed. Free Fly applies the pull to its rocks. */
  readonly wellX = new Float32Array(WELL_MAX);
  readonly wellY = new Float32Array(WELL_MAX);
  readonly wellT = new Float32Array(WELL_MAX);
  readonly wellS = new Float32Array(WELL_MAX);
  private wellNext = 0;

  /** Levels of the effect modifiers on the projectile being processed (0 = absent); one reused object. */
  private mi: EffectLevels = {
    chain: 0, boomerang: 0, orbit: 0, mine: 0, ignite: 0, corrosion: 0, frostbite: 0, executioner: 0,
    fission: 0, cauterize: 0, cleaver: 0, culling: 0, residue: 0, spill: 0, gravity: 0, staticCharge: 0,
  };

  /** Captain effects on every hit (chunk 13a). The neutral values change nothing; the world sets them at run start. */
  readonly bonus = { damageMul: 1, vsArmor: 0, vsShield: 0, vsFragment: 0 };

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
    const bounce = mods.find(m => m.type === 'bouncing');
    if (bounce) this.pool.bounces[i] = bounceCount(bounce.level ?? 1);
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
    mi.fission = mi.cauterize = mi.cleaver = mi.culling = mi.residue = mi.spill = mi.gravity = mi.staticCharge = 0;
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
        case 'fission_catalyst': mi.fission = m.level ?? 1; break;
        case 'cauterize': mi.cauterize = m.level ?? 1; break;
        case 'cleaver': mi.cleaver = m.level ?? 1; break;
        case 'culling_bolt': mi.culling = m.level ?? 1; break;
        case 'residue_seed': mi.residue = m.level ?? 1; break;
        case 'overkill_spill': mi.spill = m.level ?? 1; break;
        case 'gravity_well': mi.gravity = m.level ?? 1; break;
        case 'static_charge': mi.staticCharge = m.level ?? 1; break;
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
      pool.vx[i] = this.dxw(this.shipX + Math.cos(th) * r, pool.x[i]) / dt;
      pool.vy[i] = (this.shipY + Math.sin(th) * r - pool.y[i]) / dt;
    } else if (ph === PHASE_BOOM_OUT) {
      pool.s1[i] += Math.hypot(pool.vx[i], pool.vy[i]) * dt;
      if (pool.s1[i] >= boomerangRange(mi.boomerang)) {
        pool.phase[i] = PHASE_BOOM_BACK;
        pool.skipId[i] = -1; // the way back may hit what the way out hit
        pool.age[i] = 0;
      }
    } else if (ph === PHASE_BOOM_BACK) {
      const dx = this.dxw(this.shipX, pool.x[i]);
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
      const step = Math.hypot(pool.vx[i], pool.vy[i]) * dt;
      const dist = mineDistance(mi.mine);
      if (pool.s1[i] + step >= dist) {
        // This frame's move ends exactly `dist` px from the start; from the next frame on the mine sits still.
        const k = step > 0 ? (dist - pool.s1[i]) / step : 0;
        pool.vx[i] *= k;
        pool.vy[i] *= k;
        pool.s1[i] = dist;
        pool.s2[i] = 0;
        pool.size[i] = MINE_SIZE;
        pool.phase[i] = PHASE_MINE_WAIT;
      } else {
        pool.s1[i] += step;
      }
    } else if (ph === PHASE_MINE_WAIT) {
      pool.vx[i] = 0;
      pool.vy[i] = 0;
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
          const dx = this.wrapW > 0 ? wrapDx(e.x, pool.x[i], this.wrapW) : e.x - pool.x[i];
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
      if (mi.gravity) this.addWell(px, py, mi.gravity);

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
        } else if (isPiercing) {
          // Chunk 14a: a piercing shot passes through what it hit and cannot hit it again (it used to hit the same body every
          // frame while inside it, which made Piercing L2+ a hidden damage multiplier on big targets and wall blocks).
          this.pool.skipId[i] = target.id;
          const damageSpent = res.hpDamage; // actual hp taken
          const drop = Math.max(damage * 0.1, damageSpent) * pierceCostMul(pierceMod!.level ?? 1);
          this.pool.damage[i] -= drop;
          if (this.pool.damage[i] <= 0) {
            // Piercing first; a Bouncing block turns the shot that Piercing would have used up into a bounce, at full damage.
            if (bounceMod && this.bouncesLeft(i, bounceMod.level ?? 1) > 0) { this.pool.damage[i] = damage; this.bounce(i, field, target, px, py, hitR); }
            else this.pool.free(i);
          }
        } else if (bounceMod && this.bouncesLeft(i, bounceMod.level ?? 1) > 0) {
          this.bounce(i, field, target, px, py, hitR); // ricochet off whatever it hit, full damage kept
        } else {
          this.pool.free(i); // Destroy on hit
        }
      }
    }
  }

  // ------------------------------------------------------------------ bouncing
  /** Bounces a projectile has left (set at launch; set here for a projectile made without init()). */
  bouncesLeft(i: number, level: number): number {
    if (this.pool.bounces[i] < 0) this.pool.bounces[i] = bounceCount(level);
    return this.pool.bounces[i];
  }

  /**
   * One bounce: reflect off the surface the field reports (the contact normal), add up to +/- BOUNCE_SPREAD_DEG of seeded
   * random spread, keep the speed, use up one bounce. The target it hit is skipped until it hits something else, so a
   * bounce that points back into it cannot hit it twice. A spread that would aim into the surface turns the other way.
   */
  private bounce(i: number, field: TargetField, target: EnemyEntity, px: number, py: number, hitR: number) {
    const pool = this.pool;
    const info = field.bounceInfo ? field.bounceInfo(target, px, py, hitR) : null;
    let vx = pool.vx[i];
    let vy = pool.vy[i];
    const speed = Math.hypot(vx, vy) || 1;
    if (info) {
      const vn = vx * info.nx + vy * info.ny;
      if (vn < 0) { vx -= 2 * vn * info.nx; vy -= 2 * vn * info.ny; }
      pool.x[i] += info.nx * info.push;
      pool.y[i] += info.ny * info.push;
    } else { vx = -vx; vy = -vy; }
    const spread = (rng.combat.next() * 2 - 1) * BOUNCE_SPREAD_DEG * RAD;
    const base = Math.atan2(vy, vx);
    let a = base + spread;
    if (info && Math.cos(a) * info.nx + Math.sin(a) * info.ny < 0.1) a = base - spread;
    if (info && Math.cos(a) * info.nx + Math.sin(a) * info.ny < 0.1) a = base;
    pool.vx[i] = Math.cos(a) * speed;
    pool.vy[i] = Math.sin(a) * speed;
    pool.skipId[i] = target.id;
    pool.bounces[i]--;
    this.fx.bounces++;
  }

  /** Free Fly screen edges: a Bouncing projectile with bounces left reflects off the edge it crossed (no damage). Returns true if it did. */
  edgeBounce(i: number, minX: number, maxX: number, minY: number, maxY: number): boolean {
    const pool = this.pool;
    if (pool.bounces[i] <= 0) return false;
    let hit = false;
    if (pool.x[i] < minX && pool.vx[i] < 0) { pool.x[i] = minX; pool.vx[i] = -pool.vx[i]; hit = true; }
    else if (pool.x[i] > maxX && pool.vx[i] > 0) { pool.x[i] = maxX; pool.vx[i] = -pool.vx[i]; hit = true; }
    if (pool.y[i] < minY && pool.vy[i] < 0) { pool.y[i] = minY; pool.vy[i] = -pool.vy[i]; hit = true; }
    else if (pool.y[i] > maxY && pool.vy[i] > 0) { pool.y[i] = maxY; pool.vy[i] = -pool.vy[i]; hit = true; }
    if (!hit) return false;
    pool.bounces[i]--;
    pool.skipId[i] = -1;
    this.fx.bounces++;
    this.fx.edgeBounces++;
    return true;
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
    mi: EffectLevels,
    x: number, y: number, kind: number,
  ): DamageResult {
    let d = dmg;
    // Captain effects: damage %, and the extra against armor, shields and fragments (all identity when neutral).
    const cb = this.bonus;
    if (cb.damageMul !== 1) d *= cb.damageMul;
    if (cb.vsArmor > 0 && t.armor > 0) d *= 1 + cb.vsArmor;
    if (cb.vsShield > 0 && t.shield > 0) d *= 1 + cb.vsShield;
    if (cb.vsFragment > 0 && t.generation !== undefined && t.generation >= FRAGMENT_GENERATION) d *= 1 + cb.vsFragment;
    // Cleaver (rocks only: wall blocks have no generation): fragments take more, parents less.
    if (mi.cleaver && t.generation !== undefined) {
      d *= t.generation >= FRAGMENT_GENERATION ? cleaverBonus(mi.cleaver) : cleaverPenalty(mi.cleaver);
      this.fx.cleaverHits++;
    }
    // Culling Bolt: a share of the target's max HP on top of the hit, at most CULLING_CAP times the packet's damage.
    if (mi.culling) { d += Math.min(cullingPct(mi.culling) * t.maxHp, CULLING_CAP * dmg); this.fx.cullingHits++; }
    if (mi.executioner && t.hp < t.maxHp * EXECUTIONER_BELOW) { d *= executionerMul(mi.executioner); this.fx.executionerHits++; }
    if ((t.freezeT ?? 0) > 0) { d *= 1 + (t.freezeBonus ?? 0); this.fx.frozenBonusHits++; }
    const res = applyDamage(t, d, pure, tier, armorPierce, shieldBreaker);
    if (this.onHit) this.onHit(t, res.hpDamage, x, y, kind);
    this.afterHit(t, res.killed, d, mi, kind);
    if (t.hp > 0) {
      if (mi.ignite) this.ignite(t, d * igniteFrac(mi.ignite));
      if (mi.frostbite) this.freeze(t, mi.frostbite);
      // Static Charge: the STATIC_HITS-th hit inside the window releases an extra pulse and the count starts over.
      if (mi.staticCharge && this.staticCount(t)) {
        const extra = d * staticFrac(mi.staticCharge);
        const r2 = applyDamage(t, extra, pure, tier, armorPierce, shieldBreaker);
        this.fx.staticPulses++;
        if (this.onHit) this.onHit(t, r2.hpDamage, x, y, HIT_PULSE);
        this.afterHit(t, r2.killed, extra, mi, HIT_PULSE);
        if (r2.killed) res.killed = true;
      }
    }
    if (mi.corrosion && t.armor > 0) this.corrode(t, mi.corrosion);
    return res;
  }

  /**
   * What a hit leaves behind on the target: Cauterize and Overkill Spill marks (rocks), a Fission Catalyst request when it did
   * not kill (rocks; the world acts on it), and a Residue Seed cloud where a target died. `d` is the damage of that hit.
   */
  private afterHit(t: EnemyEntity, killed: boolean, d: number, mi: EffectLevels, kind: number) {
    const rock = t.generation !== undefined;
    if (rock) {
      if (mi.cauterize) {
        t.cauterizedTimer = Math.max(t.cauterizedTimer ?? 0, cauterizeTime(mi.cauterize));
        t.cauterizeBonus = Math.max(t.cauterizeBonus ?? 0, cauterizeBonus(mi.cauterize));
        this.fx.cauterizeMarks++;
      }
      if (killed) {
        if (mi.spill) { t.spillBurst = Math.max(t.spillBurst ?? 0, d * spillFrac(mi.spill)); this.fx.spillMarks++; }
      } else if (mi.fission) {
        t.fissionLevel = Math.max(t.fissionLevel ?? 0, mi.fission);
        this.fx.fissionMarks++;
      }
    }
    if (killed && mi.residue && kind !== HIT_CLOUD && kind !== HIT_BURN) this.addCloud(t.x, t.y, d * residueFrac(mi.residue));
  }

  /** Counts a hit on `t` for Static Charge; true when it is the STATIC_HITS-th inside STATIC_WINDOW (the count is reset then). */
  private staticCount(t: EnemyEntity): boolean {
    if (t.scN === undefined || this.clock - (t.scFirst ?? 0) > STATIC_WINDOW) { t.scN = 1; t.scFirst = this.clock; }
    else t.scN++;
    if (t.scN >= STATIC_HITS) { t.scN = 0; return true; }
    return false;
  }

  // ------------------------------------------------------------------ Residue Seed clouds and Gravity Well attractors
  private addCloud(x: number, y: number, dmgPerTick: number) {
    const k = this.cloudNext;
    this.cloudNext = (k + 1) % CLOUD_MAX;
    this.cloudX[k] = x; this.cloudY[k] = y; this.cloudT[k] = RESIDUE_TIME; this.cloudD[k] = dmgPerTick; this.cloudTick[k] = 0;
    this.fx.residueClouds++;
  }

  private addWell(x: number, y: number, level: number) {
    const k = this.wellNext;
    this.wellNext = (k + 1) % WELL_MAX;
    this.wellX[k] = x; this.wellY[k] = y; this.wellT[k] = WELL_TIME; this.wellS[k] = wellPull(level);
    this.fx.wellsMade++;
  }

  /** Drops every cloud and attractor (a restarted run). */
  clearFieldFx() {
    this.cloudT.fill(0);
    this.wellT.fill(0);
  }

  /** Moves every cloud down the screen with a scrolling wall (the cloud stays where the block died). */
  shiftClouds(dy: number) {
    for (let k = 0; k < CLOUD_MAX; k++) if (this.cloudT[k] > 0) this.cloudY[k] += dy;
  }

  /**
   * Per step, after the hits: ages the clouds and the attractors, and ticks every cloud that is due: each living target inside
   * the radius takes the tick's damage (armor and shield apply, nothing else; a kill by a cloud leaves no new cloud).
   */
  updateClouds(dt: number, field: TargetField, tier: number) {
    for (let k = 0; k < WELL_MAX; k++) if (this.wellT[k] > 0) this.wellT[k] -= dt;
    const buf = this.blast;
    for (let k = 0; k < CLOUD_MAX; k++) {
      if (this.cloudT[k] <= 0) continue;
      this.cloudT[k] -= dt;
      this.cloudTick[k] += dt;
      while (this.cloudTick[k] >= RESIDUE_TICK - 1e-9) {
        this.cloudTick[k] -= RESIDUE_TICK;
        field.collectCircle(this.cloudX[k], this.cloudY[k], RESIDUE_RADIUS, buf);
        for (const c of buf) {
          if (c.hp <= 0) continue;
          const res = applyDamage(c, this.cloudD[k], 0, tier);
          this.fx.residueTicks++;
          if (this.onHit) this.onHit(c, res.hpDamage, c.x, c.y, HIT_CLOUD);
        }
      }
    }
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

  /** Signed x delta a - b, the short way round on a ring wall (plain subtraction when the world does not wrap). */
  private dxw(a: number, b: number): number {
    return this.wrapW > 0 ? wrapDx(a, b, this.wrapW) : a - b;
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
    shieldBreaker: number | boolean, mi: EffectLevels,
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
        const d2 = this.dxw(c.x, cur.x) ** 2 + (c.y - cur.y) ** 2;
        if (d2 <= bestD) { bestD = d2; best = c; }
      }
      if (!best) break;
      seen.push(best.id);
      this.addArc(cur.x, cur.y, cur.x + this.dxw(best.x, cur.x), best.y);
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
