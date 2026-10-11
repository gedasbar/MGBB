import { rng } from '../rng';
import { ProjectilePool } from './pools';
import { Modifier } from './compilerTypes';
import { SpatialHash } from './spatialHash';
import { EnemyStats, applyDamage } from './damage';
import { EnemyField, TargetField } from './targets';
import { wrapDx } from './wrap';

export interface EnemyEntity extends EnemyStats {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export type HitCallback = (enemy: EnemyEntity, hpDamage: number, x: number, y: number) => void;

/** Base hit radius of a projectile (scaled by the pool's size). */
export const PROJECTILE_RADIUS = 10;
/** Steering constants of the path modifiers (rates are degrees per second at block level 1 and scale with level). */
export const CURVE_RATE_DEG = 90;
export const HOMING_RATE_DEG = 180;
export const HOMING_RANGE = 400;
/** Total opening angle of the homing cone, centred on the heading. */
export const HOMING_CONE_DEG = 60;
export const RANDOM_CURVE_MAX_DEG = 120;
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

  /** Free Fly: width of the cylinder world; 0 (the wall) keeps plain x maths. */
  wrapW = 0;

  /** Scratch lists reused by every projectile (no per-shot allocation). */
  private near: EnemyEntity[] = [];
  private blast: EnemyEntity[] = [];

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
    if (this.modsOf(i).some(m => m.type === 'random_curve')) {
      this.pool.aux1[i] = rng.combat.next() * 2 - 1;
      this.pool.aux2[i] = rng.combat.next() * 2 - 1;
      this.pool.aux3[i] = 0;
    }
  }

  /** Path modifiers: curving, homing and random curve turn a projectile's velocity (speed is kept). */
  steer(dt: number, targets: EnemyEntity[] | TargetField) {
    const pool = this.pool;
    const field = Array.isArray(targets) ? null : targets;
    const near = this.near;
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      pool.age[i] += dt;
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
          turn += v * RANDOM_CURVE_MAX_DEG * RAD;
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
    this.processField(new EnemyField(enemies, spatial, this.wrapW), tier);
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

      const target = field.hitCircle(px, py, hitR, this.pool.skipId[i]);
      if (!target) continue;

      if (aoeMod) {
        const radius = aoeMod.radius || aoeCircleRadius(aoeMod.level ?? 1);
        field.collectCircle(px, py, radius, blast);
        for (const ce of blast) {
          if (ce.hp <= 0) continue;
          const aoeRes = applyDamage(ce, damage, pure, tier, armorPierce, isShieldBreaker);
          if (this.onHit) this.onHit(ce, aoeRes.hpDamage, ce.x, ce.y);
        }
        this.pool.free(i); // AoE detonates
      } else if (rectMod) {
        // Detonates as a horizontal bar centred on the hit: full damage once to every target it overlaps.
        const { w, h } = aoeRectSize(rectMod.level ?? 1);
        field.collectRect(px, py, w, h, blast);
        for (const ce of blast) {
          if (ce.hp <= 0) continue;
          const r = applyDamage(ce, damage, pure, tier, armorPierce, isShieldBreaker);
          if (this.onHit) this.onHit(ce, r.hpDamage, ce.x, ce.y);
        }
        this.pool.free(i);
      } else {
        // Normal hit
        const res = applyDamage(target, damage, pure, tier, armorPierce, isShieldBreaker);
        if (this.onHit) this.onHit(target, res.hpDamage, px, py);

        if (forkMod && !this.pool.copy[i]) this.fork(i, target.id, forkMod.level ?? 1);

        if (isBouncing && target.armor > 0) {
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
