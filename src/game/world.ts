import { CONFIG } from '../config';
import { ProjectilePool } from '../engine/pools';
import { MitosisSystem } from '../engine/mitosis';
import { ProjectileSystem } from '../engine/projectiles';
import { SpatialHash } from '../engine/spatialHash';
import { compile, EjectorRecipe, Grid } from '../engine/compiler';
import { firePulse, PROJECTILE_SPEED, PX_PER_CELL, spawnOffsetsFor } from './fire';
import { PointerState } from '../input';
import { buildStarterGrid, ROCK_RADIUS } from './starter';
import { leakDamage, rockHp, rockReward, tierOfTime } from '../econ/economy';
import { easeK, EASE_TIME, GRACE_TIME } from '../engine/control';
import { fireRateMul } from '../data/hulls';

export const TOUCH_OFFSET_Y = -40; // finger sits below the ship on touch
export { PROJECTILE_SPEED, PX_PER_CELL };
export const CONTACT_DAMAGE = 10;
/** Rock fall speed (px/s). */
export const ENEMY_SPEED = 40;
/** Seconds between rock spawns. */
export const SPAWN_INTERVAL = 2;
/** A rock whose centre stays above the top edge this long is moved in at the edge. */
export const ABOVE_SCREEN_MAX = 6;

export interface HitEvent { enemyId: number; damage: number; x: number; y: number; }
/** An enemy body died: `reward` is the credits it paid (fractional; the run keeps the exact total). */
export interface KillEvent { x: number; y: number; reward: number; generation: number; }
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
  /** Where each recipe's projectiles leave, relative to the ship centre (from the ejector's cell). */
  readonly spawnOffsets: { x: number; y: number }[];

  /** Ship position in screen px (Free Fly is one fixed screen wide). */
  shipX = CONFIG.VIEW.W / 2;
  shipY = CONFIG.VIEW.H * 0.8;
  /**
   * Spawn safety. A world made with `safeStart` keeps the ship at its start spot until beginControl(); the screen
   * calls that on the first pointer move or press. Then the ship eases to the pointer over EASE_TIME and the contact
   * invulnerability lasts GRACE_TIME. Without `safeStart` (unit tests) control is immediate.
   */
  controlStarted: boolean;
  private controlT: number;
  private easeFrom = { x: 0, y: 0 };
  hull = 100;
  readonly maxHull = 100;
  invuln = 0;
  knockX = 0;
  knockY = 0;
  gameOver = false;

  time = 0;
  /** Bodies killed this run and the exact (fractional) credits they paid. */
  kills = 0;
  creditsExact = 0;
  /** Highest tier reached this run. */
  maxTier = 1;
  /** Rocks that reached the bottom edge. */
  leaks = 0;
  autoSpawn: boolean;
  private safeStart: boolean;
  /** Pulse-rate multiplier of the hull being flown (the Dart is slow). */
  private fireRateMul: number;
  /** Seconds each rock's centre has spent above the top edge. */
  private aboveT = new Map<number, number>();
  /** Horizontal direction sign of each rock's sway, flipped when it touches a side. */
  private swayDir = new Map<number, number>();
  private pulseTimer = 0;
  private spawnTimer = 0;
  private kicks = new Map<number, { vx: number; vy: number }>();

  /** Events produced during the last update() calls; consumers clear them. */
  hits: HitEvent[] = [];
  splits: SplitEvent[] = [];
  killEvents: KillEvent[] = [];

  constructor(opts: { grid?: Grid; autoSpawn?: boolean; safeStart?: boolean } = {}) {
    const compiled = compile(opts.grid ?? buildStarterGrid());
    const hull = opts.grid ?? buildStarterGrid();
    this.recipes = compiled.recipes;
    this.fireRateMul = fireRateMul(hull.hullId);
    this.spawnOffsets = spawnOffsetsFor(this.recipes, hull);
    this.warnings = compiled.warnings;
    this.projSys.modifiersTable = this.recipes.map(r => r.packet.mods);
    this.autoSpawn = opts.autoSpawn ?? true;
    this.controlStarted = !opts.safeStart;
    this.controlT = opts.safeStart ? 0 : Infinity;
    this.safeStart = !!opts.safeStart;
    this.projSys.onHit = (e, dmg, x, y) => {
      this.hits.push({ enemyId: e.id, damage: dmg, x, y });
    };
  }

  /** Tier of the run: starts at 1 and rises by one every 15 seconds of survival. */
  get tier(): number { return tierOfTime(this.time); }

  /** Whole credits earned so far (the HUD number and the summary). */
  get credits(): number { return Math.floor(this.creditsExact + 1e-9); }

  reset() {
    this.time = 0;
    this.kills = 0;
    this.creditsExact = 0;
    this.maxTier = 1;
    this.leaks = 0;
    this.killEvents.length = 0;
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
    this.controlStarted = !this.safeStart;
    this.controlT = this.safeStart ? 0 : Infinity;
    this.aboveT.clear();
    this.swayDir.clear();
    this.hits.length = 0;
    this.splits.length = 0;
  }

  /** Spawns a rock; x is clamped so it is born inside the screen width. */
  spawnRock(x: number, y: number, hp: number = rockHp(this.tier)) {
    const W = CONFIG.VIEW.W;
    const e = this.mitosis.spawn('mitotic_rock', 1, hp, Math.max(ROCK_RADIUS, Math.min(W - ROCK_RADIUS, x)), y, ROCK_RADIUS);
    if (e) e.tier = this.tier;
    return e;
  }

  /** The player's first move: the ship starts easing to the pointer and is untouchable by enemies for GRACE_TIME. */
  beginControl() {
    if (this.controlStarted) return;
    this.controlStarted = true;
    this.controlT = 0;
    this.invuln = Math.max(this.invuln, GRACE_TIME);
  }

  /** Fire one pulse: one projectile per compiled ejector recipe (chance gates may drop or boost it). */
  fire() {
    firePulse(this.pool, this.projSys, this.recipes, this.spawnOffsets, this.shipX, this.shipY);
  }

  update(dt: number, pointer: PointerState) {
    if (this.gameOver) return;
    this.time += dt;
    if (this.tier > this.maxTier) this.maxTier = this.tier;
    if (this.invuln > 0) this.invuln -= dt;
    const VW = CONFIG.VIEW.W;

    // --- Ship: pointer only. Mouse = exact, touch = small upward offset while pressed. Nothing moves it before the first move.
    let baseX = this.shipX - this.knockX;
    let baseY = this.shipY - this.knockY;
    if (this.controlStarted && pointer.seen) {
      if (pointer.type === 'touch') {
        if (pointer.active) { baseX = pointer.x; baseY = pointer.y + TOUCH_OFFSET_Y; }
      } else {
        baseX = pointer.x;
        baseY = pointer.y;
      }
    }
    if (this.controlStarted && this.controlT < EASE_TIME) {
      if (this.controlT === 0) this.easeFrom = { x: this.shipX, y: this.shipY };
      const k = easeK(this.controlT + dt);
      baseX = this.easeFrom.x + (baseX - this.easeFrom.x) * k;
      baseY = this.easeFrom.y + (baseY - this.easeFrom.y) * k;
      this.controlT += dt;
    }
    if (!this.controlStarted) { baseX = this.shipX; baseY = this.shipY; }
    const decay = Math.exp(-12 * dt);
    this.knockX *= decay;
    this.knockY *= decay;
    if (Math.abs(this.knockX) < 0.05) this.knockX = 0;
    if (Math.abs(this.knockY) < 0.05) this.knockY = 0;
    const m = CONFIG.PLAYER.MARGIN;
    this.shipX = Math.max(m, Math.min(VW - m, baseX + this.knockX));
    this.shipY = Math.max(m, Math.min(CONFIG.VIEW.H - m, baseY + this.knockY));

    // --- Auto-fire
    this.pulseTimer += dt;
    const period = 1 / (CONFIG.PULSE.BASE_RATE * this.fireRateMul);
    while (this.pulseTimer >= period) {
      this.pulseTimer -= period;
      this.fire();
    }

    // --- Spawning: above the top edge, inside the screen width, entering downward
    if (this.autoSpawn) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= SPAWN_INTERVAL) {
        this.spawnTimer = 0;
        this.spawnRock(Math.random() * (VW - 40) + 20, -20);
      }
    }

    // --- Projectile movement (path modifiers steer first)
    const pool = this.pool;
    this.projSys.steer(dt, this.mitosis.enemies);
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      pool.x[i] += pool.vx[i] * dt;
      pool.y[i] += pool.vy[i] * dt;
      if (pool.x[i] < -50 || pool.x[i] > VW + 50 || pool.y[i] < -50 || pool.y[i] > CONFIG.VIEW.H + 50) {
        pool.free(i);
      }
    }

    // --- Enemy movement (drift + sway + soft separation via spatial hash)
    const enemies = this.mitosis.enemies;
    const byId = new Map<number, (typeof enemies)[number]>();
    const spatial = new SpatialHash(VW, CONFIG.VIEW.H, 64);
    for (const e of enemies) { byId.set(e.id, e); spatial.insert(e.id, e.x, e.y); }

    for (const e of enemies) {
      e.vy = ENEMY_SPEED;
      e.vx = Math.sin(this.time + e.id) * 30 * (this.swayDir.get(e.id) ?? 1);
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

      // Confined to the screen width: a side reflects the horizontal motion (sway and knockback) and clamps it back inside.
      const minX = e.radius, maxX = VW - e.radius;
      if (e.x < minX || e.x > maxX) {
        const kk = this.kicks.get(e.id);
        const leftSide = e.x < minX;
        e.x = leftSide ? minX : maxX;
        this.swayDir.set(e.id, -(this.swayDir.get(e.id) ?? 1));
        if (kk && (leftSide ? kk.vx < 0 : kk.vx > 0)) kk.vx = -kk.vx;
      }
      // Never hover above the screen: after ABOVE_SCREEN_MAX seconds with its centre over the top edge it is moved in.
      if (e.y < 0) {
        const t = (this.aboveT.get(e.id) ?? 0) + dt;
        if (t > ABOVE_SCREEN_MAX) { e.y = 0; this.aboveT.delete(e.id); } else this.aboveT.set(e.id, t);
      } else if (this.aboveT.size) this.aboveT.delete(e.id);

      // Contact damage + knockback (none while invulnerable: the first second of control and 0.5 s after a hit)
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
        const reward = rockReward(e.tier, e.generation);
        this.kills++;
        this.creditsExact += reward;
        this.killEvents.push({ x: e.x, y: e.y, reward, generation: e.generation });
        const firstChildId = this.mitosis.nextId;
        this.mitosis.handleDeath(e, -e.hp);
        const childIds: number[] = [];
        for (const c of this.mitosis.enemies) {
          if (c.id >= firstChildId) {
            childIds.push(c.id);
            c.x = Math.max(c.radius, Math.min(VW - c.radius, c.x));
            const ang = Math.atan2(c.y - e.y, c.x - e.x) || 0;
            this.kicks.set(c.id, { vx: Math.cos(ang) * 160, vy: Math.sin(ang) * 160 });
          }
        }
        this.kicks.delete(e.id);
        this.aboveT.delete(e.id);
        this.swayDir.delete(e.id);
        this.splits.push({ parentId: e.id, x: e.x, y: e.y, childIds });
      } else if (e.y >= CONFIG.VIEW.H) {
        // Leak: the rock reached the bottom edge. It is removed and hurts the hull by its size.
        enemies.splice(i, 1);
        this.kicks.delete(e.id);
        this.aboveT.delete(e.id);
        this.swayDir.delete(e.id);
        this.leaks++;
        this.hull -= leakDamage(this.maxHull, e.generation);
        if (this.hull <= 0) { this.hull = 0; this.gameOver = true; }
      }
    }
  }
}
