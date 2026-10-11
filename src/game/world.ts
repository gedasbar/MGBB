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
import { wrapDx, wrapX, WORLD_W } from '../engine/wrap';
import { WallCamera } from '../wall/camera';
import { PROJECTILE_MAX_AGE } from '../wall/constants';
import { easeK, EASE_TIME, GRACE_TIME } from '../engine/control';
import { ENEMY_SPEED, leashStep, ringSpawnPoint, towardShip } from './leash';

export const TOUCH_OFFSET_Y = -40; // finger sits below the ship on touch
export { PROJECTILE_SPEED, PX_PER_CELL };
export const CONTACT_DAMAGE = 10;

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

  /** Ship position: x in world px (wrapped into [0, WORLD_W)), y in screen px. */
  shipX = CONFIG.VIEW.W / 2;
  shipY = CONFIG.VIEW.H * 0.8;
  /** Edge-push camera, no clamp: it keeps going and wraps. camera.x is the viewport's left edge in world px. */
  readonly camera = new WallCamera(0, 0, WORLD_W);
  /**
   * Spawn safety. A world made with `safeStart` keeps the ship at its start spot (and the camera still) until
   * beginControl(); the screens call that on the first pointer move or press. Then the ship eases to the pointer over
   * EASE_TIME and the contact invulnerability lasts GRACE_TIME. Without `safeStart` (unit tests) control is immediate.
   */
  controlStarted: boolean;
  private controlT: number;
  private easeFrom = { sx: 0, sy: 0 };
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
  /** Rocks sent back to the spawn ring by the leash (stats and tests). */
  respawns = 0;
  private safeStart: boolean;
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
    this.spawnOffsets = spawnOffsetsFor(this.recipes, hull);
    this.warnings = compiled.warnings;
    this.projSys.modifiersTable = this.recipes.map(r => r.packet.mods);
    this.autoSpawn = opts.autoSpawn ?? true;
    this.controlStarted = !opts.safeStart;
    this.controlT = opts.safeStart ? 0 : Infinity;
    this.safeStart = !!opts.safeStart;
    this.mitosis.wrapW = WORLD_W;
    this.projSys.wrapW = WORLD_W;
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
    this.camera.x = 0;
    this.camera.speed = 0;
    this.camera.travel = 0;
    this.shipX = CONFIG.VIEW.W / 2;
    this.shipY = CONFIG.VIEW.H * 0.8;
    this.controlStarted = !this.safeStart;
    this.controlT = this.safeStart ? 0 : Infinity;
    this.respawns = 0;
    this.hits.length = 0;
    this.splits.length = 0;
  }

  spawnRock(x: number, y: number, hp: number = rockHp(this.tier)) {
    const e = this.mitosis.spawn('mitotic_rock', 1, hp, x, y, ROCK_RADIUS);
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

  /** Screen x of a world x for the current camera: the short way round, centred on the viewport. */
  screenX(x: number): number {
    return wrapDx(x, this.camera.x + CONFIG.VIEW.W / 2) + CONFIG.VIEW.W / 2;
  }

  /** A fresh spawn point on the off-screen ring. */
  private ringPoint() {
    return ringSpawnPoint(this.camera.x, Math.random);
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

    // --- Camera: the edge-push camera of the wall without its clamp. Nothing pushes before the first move.
    const pushing = this.controlStarted && pointer.seen && (pointer.type !== 'touch' || pointer.active);
    this.camera.update(dt, pushing ? pointer.x : null);
    const camX = this.camera.x;

    // --- Ship: pointer only, in screen space (world x = camera x + screen x). Mouse = exact, touch = small upward offset while pressed.
    // Knockback is a screen-space offset that decays; the ship stays where it is on the screen when the pointer lets go.
    const decay = Math.exp(-12 * dt);
    let baseX = wrapDx(this.shipX, camX) - this.knockX;
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
      if (this.controlT === 0) this.easeFrom = { sx: wrapDx(this.shipX, camX), sy: this.shipY };
      const k = easeK(this.controlT + dt);
      baseX = this.easeFrom.sx + (baseX - this.easeFrom.sx) * k;
      baseY = this.easeFrom.sy + (baseY - this.easeFrom.sy) * k;
      this.controlT += dt;
    }
    if (!this.controlStarted) { baseX = wrapDx(this.shipX, camX); baseY = this.shipY; }
    this.knockX *= decay;
    this.knockY *= decay;
    if (Math.abs(this.knockX) < 0.05) this.knockX = 0;
    if (Math.abs(this.knockY) < 0.05) this.knockY = 0;
    const m = CONFIG.PLAYER.MARGIN;
    const screenX = Math.max(m, Math.min(VW - m, baseX + this.knockX));
    this.shipX = wrapX(camX + screenX);
    this.shipY = Math.max(m, Math.min(CONFIG.VIEW.H - m, baseY + this.knockY));

    // --- Auto-fire
    this.pulseTimer += dt;
    const period = 1 / CONFIG.PULSE.BASE_RATE;
    while (this.pulseTimer >= period) {
      this.pulseTimer -= period;
      this.fire();
    }

    // --- Spawning: on a ring just off-screen (above and to the sides), in wrapped world x
    if (this.autoSpawn) {
      this.spawnTimer += dt;
      if (this.spawnTimer >= 2) {
        this.spawnTimer = 0;
        const p = this.ringPoint();
        this.spawnRock(p.x, p.y);
      }
    }

    // --- Projectile movement (path modifiers steer first). x wraps; y and age end a shot.
    const pool = this.pool;
    this.projSys.steer(dt, this.mitosis.enemies);
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      pool.x[i] = wrapX(pool.x[i] + pool.vx[i] * dt);
      pool.y[i] += pool.vy[i] * dt;
      if (pool.y[i] < -50 || pool.y[i] > CONFIG.VIEW.H + 50 || pool.age[i] > PROJECTILE_MAX_AGE) {
        pool.free(i);
      }
    }

    // --- Enemy movement (drift + sway + soft separation via spatial hash, all on the cylinder)
    const enemies = this.mitosis.enemies;
    const byId = new Map<number, (typeof enemies)[number]>();
    const spatial = new SpatialHash(WORLD_W, CONFIG.VIEW.H, 64, WORLD_W);
    for (const e of enemies) { byId.set(e.id, e); spatial.insert(e.id, e.x, e.y); }

    for (const e of enemies) {
      e.vy = ENEMY_SPEED;
      e.vx = Math.sin(this.time + e.id) * 30;
      // Leash: far from the ship for too long -> head for it; still very far -> back to the spawn ring.
      const leash = leashStep(e, this.shipX, this.shipY, dt);
      if (leash === 'pull') {
        const u = towardShip(e, this.shipX, this.shipY);
        e.vx = u.x * ENEMY_SPEED;
        e.vy = u.y * ENEMY_SPEED;
      } else if (leash === 'respawn') {
        this.recycle(e);
        continue;
      }
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
        const dx = wrapDx(e.x, o.x);
        const dy = e.y - o.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = e.radius + o.radius;
        if (dist > 0 && dist < minDist) {
          const push = (minDist - dist) * 10 * dt;
          e.x += (dx / dist) * push;
          e.y += (dy / dist) * push;
        }
      }
      e.x = wrapX(e.x + e.vx * dt);
      e.y += e.vy * dt;

      // Contact damage + knockback (none while invulnerable: the first second of control and 0.5 s after a hit)
      const sx = wrapDx(this.shipX, e.x);
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
            const ang = Math.atan2(c.y - e.y, wrapDx(c.x, e.x)) || 0;
            this.kicks.set(c.id, { vx: Math.cos(ang) * 160, vy: Math.sin(ang) * 160 });
          }
        }
        this.kicks.delete(e.id);
        this.splits.push({ parentId: e.id, x: e.x, y: e.y, childIds });
      } else if (e.y >= CONFIG.VIEW.H) {
        if (Math.abs(wrapDx(e.x, camX + VW / 2)) <= VW / 2 + e.radius) {
          // Leak: the rock reached the bottom edge of the screen. It is removed and hurts the hull by its size.
          enemies.splice(i, 1);
          this.kicks.delete(e.id);
          this.leaks++;
          this.hull -= leakDamage(this.maxHull, e.generation);
          if (this.hull <= 0) { this.hull = 0; this.gameOver = true; }
        } else {
          // Fell past the bottom while off to the side: nobody saw it, so it costs nothing and goes back to the ring.
          this.recycle(e);
        }
      }
    }
  }

  /** Sends an enemy back to the spawn ring: same type, generation and HP (so the same HP fraction). */
  recycle(e: (typeof this.mitosis.enemies)[number]) {
    const p = this.ringPoint();
    e.x = p.x;
    e.y = p.y;
    e.farT = 0;
    e.farT2 = 0;
    this.kicks.delete(e.id);
    this.respawns++;
  }
}
