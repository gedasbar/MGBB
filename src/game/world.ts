import { CONFIG } from '../config';
import { ProjectilePool } from '../engine/pools';
import { MitosisSystem } from '../engine/mitosis';
import { ProjectileSystem } from '../engine/projectiles';
import { SpatialHash } from '../engine/spatialHash';
import { compile, EjectorRecipe, Grid } from '../engine/compiler';
import { PointerState } from '../input';
import { buildStarterGrid, ROCK_HP, ROCK_RADIUS } from './starter';

export const TOUCH_OFFSET_Y = -40; // finger sits below the ship on touch
export const PROJECTILE_SPEED = 600;
export const CONTACT_DAMAGE = 10;

export interface HitEvent { enemyId: number; damage: number; x: number; y: number; }
export interface SplitEvent { parentId: number; x: number; y: number; childIds: number[]; }

/**
 * Pure game simulation (no Pixi). main.ts renders it; tests drive it directly.
 */
export class World {
  readonly pool = new ProjectilePool();
  readonly projSys = new ProjectileSystem(this.pool);
  readonly mitosis = new MitosisSystem();
  readonly recipes: EjectorRecipe[];
  readonly warnings: string[];

  shipX = CONFIG.VIEW.W / 2;
  shipY = CONFIG.VIEW.H * 0.8;
  hull = 100;
  readonly maxHull = 100;
  invuln = 0;
  knockX = 0;
  knockY = 0;
  gameOver = false;

  time = 0;
  autoSpawn: boolean;
  private pulseTimer = 0;
  private spawnTimer = 0;
  private kicks = new Map<number, { vx: number; vy: number }>();

  /** Events produced during the last update() calls; consumers clear them. */
  hits: HitEvent[] = [];
  splits: SplitEvent[] = [];

  constructor(opts: { grid?: Grid; autoSpawn?: boolean } = {}) {
    const compiled = compile(opts.grid ?? buildStarterGrid());
    this.recipes = compiled.recipes;
    this.warnings = compiled.warnings;
    this.projSys.modifiersTable = this.recipes.map(r => r.packet.mods);
    this.autoSpawn = opts.autoSpawn ?? true;
    this.projSys.onHit = (e, dmg, x, y) => {
      this.hits.push({ enemyId: e.id, damage: dmg, x, y });
    };
  }

  reset() {
    this.hull = this.maxHull;
    this.invuln = 0;
    this.knockX = 0;
    this.knockY = 0;
    this.mitosis.enemies.length = 0;
    this.kicks.clear();
    this.pool.active.fill(0);
    this.pool.count = 0;
    this.gameOver = false;
    this.shipX = CONFIG.VIEW.W / 2;
    this.shipY = CONFIG.VIEW.H * 0.8;
    this.hits.length = 0;
    this.splits.length = 0;
  }

  spawnRock(x: number, y: number, hp: number = ROCK_HP) {
    return this.mitosis.spawn('mitotic_rock', 1, hp, x, y, ROCK_RADIUS);
  }

  /** Fire one pulse: one projectile per compiled ejector recipe. */
  fire() {
    for (let rIdx = 0; rIdx < this.recipes.length; rIdx++) {
      const r = this.recipes[rIdx];
      const speed = PROJECTILE_SPEED * (r.packet.speedMul || 1);
      let vx = 0;
      let vy = 0;
      if (r.direction === 'N') vy = -speed;
      else if (r.direction === 'S') vy = speed;
      else if (r.direction === 'E') vx = speed;
      else vx = -speed;
      this.pool.spawn(this.shipX, this.shipY - 15, vx, vy, r.packet.damage, r.packet.pure || 0, rIdx);
    }
  }

  update(dt: number, pointer: PointerState) {
    if (this.gameOver) return;
    this.time += dt;
    if (this.invuln > 0) this.invuln -= dt;

    // --- Ship: pointer only. Mouse = exact, touch = small upward offset while pressed.
    let baseX = this.shipX - this.knockX;
    let baseY = this.shipY - this.knockY;
    if (pointer.seen) {
      if (pointer.type === 'touch') {
        if (pointer.active) { baseX = pointer.x; baseY = pointer.y + TOUCH_OFFSET_Y; }
      } else {
        baseX = pointer.x;
        baseY = pointer.y;
      }
    }
    const decay = Math.exp(-12 * dt);
    this.knockX *= decay;
    this.knockY *= decay;
    if (Math.abs(this.knockX) < 0.05) this.knockX = 0;
    if (Math.abs(this.knockY) < 0.05) this.knockY = 0;
    const m = CONFIG.PLAYER.MARGIN;
    this.shipX = Math.max(m, Math.min(CONFIG.VIEW.W - m, baseX + this.knockX));
    this.shipY = Math.max(m, Math.min(CONFIG.VIEW.H - m, baseY + this.knockY));

    // --- Auto-fire
    this.pulseTimer += dt;
    const period = 1 / CONFIG.PULSE.BASE_RATE;
    while (this.pulseTimer >= period) {
      this.pulseTimer -= period;
      this.fire();
    }

    // --- Spawning
    if (this.autoSpawn) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= 2) {
        this.spawnTimer = 0;
        this.spawnRock(Math.random() * (CONFIG.VIEW.W - 40) + 20, -20);
      }
    }

    // --- Projectile movement
    const pool = this.pool;
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      pool.x[i] += pool.vx[i] * dt;
      pool.y[i] += pool.vy[i] * dt;
      if (pool.x[i] < -50 || pool.x[i] > CONFIG.VIEW.W + 50 || pool.y[i] < -50 || pool.y[i] > CONFIG.VIEW.H + 50) {
        pool.free(i);
      }
    }

    // --- Enemy movement (drift + sway + soft separation via spatial hash)
    const enemies = this.mitosis.enemies;
    const byId = new Map<number, (typeof enemies)[number]>();
    const spatial = new SpatialHash(CONFIG.VIEW.W, CONFIG.VIEW.H, 64);
    for (const e of enemies) { byId.set(e.id, e); spatial.insert(e.id, e.x, e.y); }

    for (const e of enemies) {
      e.vy = 40;
      e.vx = Math.sin(this.time + e.id) * 30;
      const kick = this.kicks.get(e.id);
      if (kick) {
        e.vx += kick.vx;
        e.vy += kick.vy;
        kick.vx *= decay;
        kick.vy *= decay;
        if (Math.abs(kick.vx) + Math.abs(kick.vy) < 1) this.kicks.delete(e.id);
      }
      for (const nid of spatial.query(e.x, e.y, e.radius * 2)) {
        if (nid === e.id) continue;
        const o = byId.get(nid);
        if (!o) continue;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = e.radius + o.radius;
        if (dist > 0 && dist < minDist) {
          const push = (minDist - dist) * 10 * dt;
          e.x += (dx / dist) * push;
          e.y += (dy / dist) * push;
        }
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Contact damage + knockback
      const sx = this.shipX - e.x;
      const sy = this.shipY - e.y;
      const d = Math.sqrt(sx * sx + sy * sy) || 1;
      if (d < e.radius + CONFIG.PLAYER.HITBOX_R && this.invuln <= 0) {
        this.hull -= CONTACT_DAMAGE;
        this.invuln = 0.5;
        this.knockX += (sx / d) * 50;
        this.knockY += (sy / d) * 50;
        if (this.hull <= 0) { this.hull = 0; this.gameOver = true; }
      }
    }

    // --- Projectile hits (rebuild hash with post-move positions)
    spatial.clear();
    for (const e of enemies) spatial.insert(e.id, e.x, e.y);
    this.projSys.processHits(enemies, spatial, 1);

    // --- Death → mitosis
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.hp <= 0) {
        const firstChildId = this.mitosis.nextId;
        this.mitosis.handleDeath(e, -e.hp);
        const childIds: number[] = [];
        for (const c of this.mitosis.enemies) {
          if (c.id >= firstChildId) {
            childIds.push(c.id);
            const ang = Math.atan2(c.y - e.y, c.x - e.x) || 0;
            this.kicks.set(c.id, { vx: Math.cos(ang) * 160, vy: Math.sin(ang) * 160 });
          }
        }
        this.kicks.delete(e.id);
        this.splits.push({ parentId: e.id, x: e.x, y: e.y, childIds });
      } else if (e.y > CONFIG.VIEW.H + 50) {
        enemies.splice(i, 1);
        this.kicks.delete(e.id);
      }
    }
  }
}
