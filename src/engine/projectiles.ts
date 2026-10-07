import { rng } from '../rng';
import { ProjectilePool } from './pools';
import { Modifier } from './compilerTypes';
import { SpatialHash } from './spatialHash';
import { EnemyStats, applyDamage } from './damage';

export interface EnemyEntity extends EnemyStats {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export type HitCallback = (enemy: EnemyEntity, hpDamage: number, x: number, y: number) => void;

export class ProjectileSystem {
  pool: ProjectilePool;
  
  modifiersTable: Modifier[][] = [];

  /** Optional hook fired once per enemy damaged (used for hit flash / damage numbers). */
  onHit: HitCallback | null = null;

  constructor(pool: ProjectilePool) {
    this.pool = pool;
  }
  
  processHits(enemies: EnemyEntity[], spatial: SpatialHash, tier: number) {
    for (let i = 0; i < this.pool.max; i++) {
      if (!this.pool.active[i]) continue;
      
      const px = this.pool.x[i];
      const py = this.pool.y[i];
      const damage = this.pool.damage[i];
      const pure = this.pool.pure[i];
      const mods = this.modifiersTable[this.pool.modIndex[i]] || [];
      
      const isPiercing = mods.some(m => m.type === 'piercing');
      const isBouncing = mods.some(m => m.type === 'bouncing');
      const aoeMod = mods.find(m => m.type === 'aoe_circle');
      const isArmorPiercer = mods.some(m => m.type === 'armor_piercer_tip');
      const isShieldBreaker = mods.some(m => m.type === 'shield_breaker');

      // Find hit target (radius 10 for projectile + enemy.radius)
      // We query spatial hash
      const candidates = spatial.query(px, py, 50); // Use 50 as max query radius for simple contact
      let hitAny = false;
      let target: EnemyEntity | null = null;
      for (const id of candidates) {
        const e = enemies.find(en => en.id === id);
        if (e && e.hp > 0) {
          const distSq = (e.x - px) ** 2 + (e.y - py) ** 2;
          if (distSq <= (e.radius + 10) ** 2) {
            target = e;
            hitAny = true;
            break;
          }
        }
      }

      if (hitAny && target) {
        if (aoeMod) {
          const radius = aoeMod.radius || 50;
          const aoeCandidates = spatial.query(px, py, radius + 20); // 20 padding for enemy sizes
          for (const cid of aoeCandidates) {
            const ce = enemies.find(en => en.id === cid);
            if (ce && ce.hp > 0) {
              const dSq = (ce.x - px) ** 2 + (ce.y - py) ** 2;
              if (dSq <= (ce.radius + radius) ** 2) {
                const aoeRes = applyDamage(ce, damage, pure, tier, isArmorPiercer, isShieldBreaker);
                if (this.onHit) this.onHit(ce, aoeRes.hpDamage, ce.x, ce.y);
              }
            }
          }
          this.pool.free(i); // AoE detonates
        } else {
          // Normal hit
          const res = applyDamage(target, damage, pure, tier, isArmorPiercer, isShieldBreaker);
          if (this.onHit) this.onHit(target, res.hpDamage, px, py);
          
          if (isBouncing && target.armor > 0) {
            // Bounce: keep full damage, pick new direction
            const angle = rng.combat.next() * Math.PI * 2;
            const speed = Math.sqrt(this.pool.vx[i]**2 + this.pool.vy[i]**2) || 200;
            this.pool.vx[i] = Math.cos(angle) * speed;
            this.pool.vy[i] = Math.sin(angle) * speed;
            // We'll advance it slightly to avoid re-colliding immediately?
            this.pool.x[i] += this.pool.vx[i] * 0.1;
            this.pool.y[i] += this.pool.vy[i] * 0.1;
          } else if (isPiercing) {
            const damageSpent = res.hpDamage; // actual hp taken
            const drop = Math.max(damage * 0.1, damageSpent);
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
  }
}
