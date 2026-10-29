import type { EnemyEntity } from './projectiles';
import { SpatialHash } from './spatialHash';
import { CELL } from '../wall/constants';

/** The answer of `nearestInCone`: the target and the vector from the shot to it (the short way round on a ring wall). */
export interface HomePick { target: EnemyEntity | null; dx: number; dy: number }
export const newHomePick = (): HomePick => ({ target: null, dx: 0, dy: 0 });

/** How far past its query radius a hash cell search looks, so a rock that moved a few pixels since the hash was built is still found. */
export const SPATIAL_MARGIN = 24;

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
  /**
   * Living targets in the AoE Rectangle of chunk 19a: `cols` x `rows` wall cells (CELL px each), centred sideways on `target` and
   * reaching from its row `rows - 1` rows BEHIND it (up the screen, away from the ship).
   */
  collectArea(target: EnemyEntity, cols: number, rows: number, out: EnemyEntity[]): void;
  /** Living targets that may lie within `range` of (x, y) (the caller filters by distance and cone). */
  collectNear(x: number, y: number, range: number, out: EnemyEntity[]): void;
  /**
   * Homing (chunk 21b): the nearest LIVING target within `range` of (px, py) whose direction lies inside the cone round the unit heading
   * (hx, hy), the cone's half angle given as its cosine; ties go to the one the field visits last. No allocation. Fills `out` and returns
   * true, or returns false (and leaves `out` alone) when there is none.
   */
  nearestInCone(px: number, py: number, range: number, hx: number, hy: number, cosHalf: number, out: HomePick): boolean;
  /** The target with this id if it still exists (it may be dead: the caller checks hp), else null. */
  byId(id: number): EnemyEntity | null;
  /** Ricochet surface at a hit; absent or null = the caller picks a random direction. */
  bounceInfo?(t: EnemyEntity, x: number, y: number, r: number): BounceInfo | null;
}

/** The rocks of Free Fly: circles found through the spatial hash. Made once per world; `refresh()` follows the hash after every rebuild. */
export class EnemyField implements TargetField {
  private ids = new Map<number, EnemyEntity>();
  /** Reused by every query (no list is made per shot). */
  private buf: number[] = [];

  constructor(private enemies: EnemyEntity[], private spatial: SpatialHash) {
    this.refresh();
  }

  /** Re-reads the enemy list (call after the hash was rebuilt). */
  refresh() {
    this.ids.clear();
    for (const e of this.enemies) this.ids.set(e.id, e);
  }

  byId(id: number): EnemyEntity | null {
    return this.ids.get(id) ?? null;
  }

  hitCircle(px: number, py: number, hitR: number, skipId: number): EnemyEntity | null {
    const buf = this.spatial.queryInto(px, py, 50, this.buf);
    for (let k = 0; k < buf.length; k++) {
      const id = buf[k];
      if (id === skipId) continue;
      const e = this.ids.get(id);
      if (e && e.hp > 0 && (e.x - px) ** 2 + (e.y - py) ** 2 <= (e.radius + hitR) ** 2) return e;
    }
    return null;
  }

  collectCircle(px: number, py: number, radius: number, out: EnemyEntity[]) {
    out.length = 0;
    const buf = this.spatial.queryInto(px, py, radius + 20, this.buf);
    for (let k = 0; k < buf.length; k++) {
      const e = this.ids.get(buf[k]);
      if (e && e.hp > 0 && (e.x - px) ** 2 + (e.y - py) ** 2 <= (e.radius + radius) ** 2) out.push(e);
    }
  }

  nearestInCone(px: number, py: number, range: number, hx: number, hy: number, cosHalf: number, out: HomePick): boolean {
    const buf = this.spatial.queryInto(px, py, range + SPATIAL_MARGIN, this.buf);
    let best = range * range;
    let found: EnemyEntity | null = null;
    let bdx = 0, bdy = 0;
    for (let k = 0; k < buf.length; k++) {
      const e = this.ids.get(buf[k]);
      if (!e || e.hp <= 0) continue;
      const dx = e.x - px, dy = e.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > best) continue;
      if (dx * hx + dy * hy < Math.sqrt(d2) * cosHalf) continue;
      best = d2; found = e; bdx = dx; bdy = dy;
    }
    if (!found) return false;
    out.target = found; out.dx = bdx; out.dy = bdy;
    return true;
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

  collectArea(t: EnemyEntity, cols: number, rows: number, out: EnemyEntity[]) {
    // Free Fly has no grid: the same cell size in pixels, centred on the hit rock, reaching up from it.
    this.collectRect(t.x, t.y - ((rows - 1) * CELL) / 2, cols * CELL, rows * CELL, out);
  }

  collectNear(_x: number, _y: number, _range: number, out: EnemyEntity[]) {
    out.length = 0;
    for (const e of this.enemies) if (e.hp > 0) out.push(e);
  }

  /** A rock is a circle: the contact normal points from its centre to the hit. */
  bounceInfo(t: EnemyEntity, x: number, y: number, r: number): BounceInfo | null {
    const dx = x - t.x, dy = y - t.y;
    const d = Math.hypot(dx, dy);
    if (d > 1e-6) return { nx: dx / d, ny: dy / d, push: Math.max(0, t.radius + r - d) + 0.5 };
    return { nx: 0, ny: -1, push: t.radius + r + 0.5 };
  }
}
