import type { EnemyEntity } from './projectiles';
import { SpatialHash } from './spatialHash';

/** Where a ricochet leaves a surface: unit normal and how far to move the projectile out of the target. */
export interface BounceInfo { nx: number; ny: number; push: number }

/**
 * Everything the hit pipeline needs to know about the things it shoots at. Enemies (spatial hash) and wall blocks
 * (grid lookup) each provide one; ProjectileSystem.processField is the single place that applies damage.
 * The `collect*` methods clear `out` and fill it with LIVING targets only.
 */
export interface TargetField {
  /** First living target whose shape touches the circle, ignoring `skipId`. */
  hitCircle(x: number, y: number, r: number, skipId: number): EnemyEntity | null;
  /** Living targets touched by a circle of radius r (the AoE blast). */
  collectCircle(x: number, y: number, r: number, out: EnemyEntity[]): void;
  /** Living targets touched by a w x h rectangle centred on (x, y). */
  collectRect(x: number, y: number, w: number, h: number, out: EnemyEntity[]): void;
  /** Living targets that may lie within `range` of (x, y) (homing; the caller filters by distance and cone). */
  collectNear(x: number, y: number, range: number, out: EnemyEntity[]): void;
  /** Ricochet surface at a hit; absent or null = the caller picks a random direction. */
  bounceInfo?(t: EnemyEntity, x: number, y: number, r: number): BounceInfo | null;
}

/** The rocks of Free Fly: circles found through the spatial hash. */
export class EnemyField implements TargetField {
  private byId = new Map<number, EnemyEntity>();

  constructor(private enemies: EnemyEntity[], private spatial: SpatialHash) {
    for (const e of enemies) this.byId.set(e.id, e);
  }

  hitCircle(px: number, py: number, hitR: number, skipId: number): EnemyEntity | null {
    for (const id of this.spatial.query(px, py, 50)) {
      if (id === skipId) continue;
      const e = this.byId.get(id);
      if (e && e.hp > 0 && (e.x - px) ** 2 + (e.y - py) ** 2 <= (e.radius + hitR) ** 2) return e;
    }
    return null;
  }

  collectCircle(px: number, py: number, radius: number, out: EnemyEntity[]) {
    out.length = 0;
    for (const id of this.spatial.query(px, py, radius + 20)) {
      const e = this.byId.get(id);
      if (e && e.hp > 0 && (e.x - px) ** 2 + (e.y - py) ** 2 <= (e.radius + radius) ** 2) out.push(e);
    }
  }

  collectRect(px: number, py: number, w: number, h: number, out: EnemyEntity[]) {
    out.length = 0;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const ddx = Math.max(0, Math.abs(e.x - px) - w / 2);
      const ddy = Math.max(0, Math.abs(e.y - py) - h / 2);
      if (ddx * ddx + ddy * ddy <= e.radius * e.radius) out.push(e);
    }
  }

  collectNear(_x: number, _y: number, _range: number, out: EnemyEntity[]) {
    out.length = 0;
    for (const e of this.enemies) if (e.hp > 0) out.push(e);
  }
}
