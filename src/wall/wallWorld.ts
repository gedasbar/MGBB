import { CONFIG } from '../config';
import { compile, EjectorRecipe, Grid } from '../engine/compiler';
import { ProjectilePool } from '../engine/pools';
import { EnemyEntity, ProjectileSystem } from '../engine/projectiles';
import { BounceInfo, TargetField } from '../engine/targets';
import { firePulse, spawnOffsetsFor } from '../game/fire';
import { buildStarterGrid } from '../game/starter';
import {
  CELL, DRAIN_PER_SEC, PROJECTILE_MAX_AGE, SHIELD_REGEN_DELAY, SHIELD_REGEN_PER_SEC, STOP_LINE_Y, VIEW_H, WORLD_WIDTH,
} from './constants';
import { LevelDef, rewardPerBlock } from './level';

/** One living block of a wall. x/y are the block centre (x in world px, y in screen px); `radius` is the half size. */
export interface Block extends EnemyEntity {
  col: number;
  row: number;
  /** World time of the last hit (shield regeneration waits SHIELD_REGEN_DELAY after it). */
  lastHit: number;
  /** Seconds of hit flash left (drawing only). */
  flash: number;
}

export interface WallHitEvent { blockId: number; damage: number; x: number; y: number }
export interface WallKillEvent { x: number; y: number; reward: number }
export type WallState = 'playing' | 'won' | 'lost';

/** What the world needs from the progress store at the end of a level. */
export interface WallBank { recordWallRun(run: { credits: number; kills: number }): void }

/** Ship position the pointer asks for, in world px (x) and screen px (y). */
export interface ShipTarget { x: number; y: number }

const FLASH_TIME = 0.08;
const EPS = 1e-6;

/** Circle against axis-aligned box: squared distance from the circle centre to the box. */
function distSqToBox(px: number, py: number, bx: number, by: number): number {
  const qx = Math.max(bx, Math.min(px, bx + CELL));
  const qy = Math.max(by, Math.min(py, by + CELL));
  return (px - qx) ** 2 + (py - qy) ** 2;
}

/**
 * The wall as a set of targets for the shared hit pipeline: projectile position -> grid cell lookup,
 * no spatial hash. Only living blocks are ever returned.
 */
export class BlockField implements TargetField {
  constructor(private w: WallWorld) {}

  private forEachIn(x0: number, y0: number, x1: number, y1: number, fn: (b: Block) => void) {
    const w = this.w;
    const c0 = Math.max(0, Math.floor(x0 / CELL));
    const c1 = Math.min(w.level.cols - 1, Math.floor(x1 / CELL));
    const r0 = Math.max(0, w.level.rows + Math.floor((y0 - w.wallOffsetY) / CELL));
    const r1 = Math.min(w.level.rows - 1, w.level.rows + Math.floor((y1 - w.wallOffsetY) / CELL));
    for (let r = r1; r >= r0; r--) {
      for (let c = c0; c <= c1; c++) {
        const b = w.blocks[r * w.level.cols + c];
        if (b) fn(b);
      }
    }
  }

  hitCircle(px: number, py: number, hitR: number, skipId: number): EnemyEntity | null {
    let best: Block | null = null;
    let bestD = hitR * hitR;
    this.forEachIn(px - hitR, py - hitR, px + hitR, py + hitR, b => {
      if (b.id === skipId) return;
      const d = distSqToBox(px, py, b.col * CELL, this.w.blockTop(b.row));
      if (d <= bestD) { bestD = d; best = b; }
    });
    return best;
  }

  collectCircle(px: number, py: number, r: number, out: EnemyEntity[]) {
    out.length = 0;
    this.forEachIn(px - r, py - r, px + r, py + r, b => {
      if (distSqToBox(px, py, b.col * CELL, this.w.blockTop(b.row)) <= r * r) out.push(b);
    });
  }

  collectRect(px: number, py: number, w: number, h: number, out: EnemyEntity[]) {
    out.length = 0;
    this.forEachIn(px - w / 2, py - h / 2, px + w / 2, py + h / 2, b => {
      if (Math.abs(b.x - px) <= w / 2 + CELL / 2 && Math.abs(b.y - py) <= h / 2 + CELL / 2) out.push(b);
    });
  }

  collectNear(px: number, py: number, range: number, out: EnemyEntity[]) {
    out.length = 0;
    this.forEachIn(px - range, py - range, px + range, py + range, b => { out.push(b); });
  }

  bounceInfo(t: EnemyEntity, px: number, py: number, r: number): BounceInfo | null {
    const b = t as Block;
    const bx = b.col * CELL;
    const by = this.w.blockTop(b.row);
    const qx = Math.max(bx, Math.min(px, bx + CELL));
    const qy = Math.max(by, Math.min(py, by + CELL));
    const dx = px - qx;
    const dy = py - qy;
    const d = Math.hypot(dx, dy);
    if (d > EPS) return { nx: dx / d, ny: dy / d, push: Math.max(0, r - d) + 0.5 };
    // Centre inside the block: leave through the nearest face.
    const faces = [
      { d: px - bx, nx: -1, ny: 0 }, { d: bx + CELL - px, nx: 1, ny: 0 },
      { d: py - by, nx: 0, ny: -1 }, { d: by + CELL - py, nx: 0, ny: 1 },
    ];
    const f = faces.reduce((a, c) => (c.d < a.d ? c : a));
    return { nx: f.nx, ny: f.ny, push: f.d + r + 0.5 };
  }
}

/**
 * Pure simulation of a wall level (no Pixi). The wall is a static grid that scrolls down at `approachSpeed`
 * until a living block touches the stop line. Shots, damage and credits go through the same pipeline as Free Fly.
 */
export class WallWorld {
  readonly pool = new ProjectilePool();
  readonly projSys = new ProjectileSystem(this.pool);
  readonly recipes: EjectorRecipe[];
  readonly warnings: string[];
  readonly spawnOffsets: { x: number; y: number }[];
  readonly field = new BlockField(this);

  /** Row-major living blocks (null = empty or destroyed). */
  readonly blocks: (Block | null)[] = [];
  /** Every block ever created, for iteration. */
  readonly all: Block[] = [];
  /** Blocks with a shield pool (regeneration only walks these). */
  private shielded: Block[] = [];
  private rowAlive: number[];
  private lowRow = -1;
  private bounceEdge: boolean[];

  /** Screen y of the wall's bottom edge. The wall starts fully above the screen (offset 0) and moves down. */
  wallOffsetY = 0;
  shipX = WORLD_WIDTH / 2;
  shipY = CONFIG.VIEW.H * 0.8;
  hull = 100;
  readonly maxHull = 100;
  time = 0;
  state: WallState = 'playing';
  /** True while a living block's bottom edge is at the stop line. */
  touching = false;

  readonly total: number;
  alive: number;
  destroyed = 0;
  creditsExact = 0;
  private banked = false;
  autoFire = true;
  private pulseTimer = 0;

  /** Events produced by update(); consumers clear them. */
  hits: WallHitEvent[] = [];
  killEvents: WallKillEvent[] = [];

  constructor(readonly level: LevelDef, opts: { grid?: Grid } = {}) {
    const hullGrid = opts.grid ?? buildStarterGrid();
    const compiled = compile(opts.grid ?? buildStarterGrid());
    this.recipes = compiled.recipes;
    this.warnings = compiled.warnings;
    this.spawnOffsets = spawnOffsetsFor(this.recipes, hullGrid);
    this.projSys.modifiersTable = this.recipes.map(r => r.packet.mods);
    this.bounceEdge = this.recipes.map(r => r.packet.mods.some(m => m.type === 'bouncing'));

    this.rowAlive = new Array(level.rows).fill(0);
    let alive = 0;
    for (let r = 0; r < level.rows; r++) {
      for (let c = 0; c < level.cols; c++) {
        const def = level.cells[r * level.cols + c];
        if (!def) { this.blocks.push(null); continue; }
        const b: Block = {
          id: r * level.cols + c, col: c, row: r, x: c * CELL + CELL / 2, y: 0, radius: CELL / 2,
          hp: def.hp, maxHp: def.hp, armor: def.armor, shield: def.shield, maxShield: def.shield,
          lastHit: -Infinity, flash: 0,
        };
        this.blocks.push(b);
        this.all.push(b);
        if (b.maxShield > 0) this.shielded.push(b);
        this.rowAlive[r]++;
        alive++;
      }
    }
    this.alive = alive;
    this.total = alive;
    this.lowRow = this.findLowRow(level.rows - 1);
    this.syncY();

    this.projSys.onHit = (e, dmg, x, y) => {
      const b = e as Block;
      b.lastHit = this.time;
      b.flash = FLASH_TIME;
      this.hits.push({ blockId: b.id, damage: dmg, x, y });
      if (b.hp <= 0) this.destroyBlock(b);
    };
  }

  get tier(): number { return this.level.tier; }
  /** Whole credits earned so far. */
  get credits(): number { return Math.floor(this.creditsExact + 1e-9); }
  get percentDestroyed(): number { return this.total === 0 ? 100 : (this.destroyed / this.total) * 100; }

  /** Screen y of the top edge of a row. */
  blockTop(row: number): number { return this.wallOffsetY - (this.level.rows - row) * CELL; }

  /** Grid cell under a world position (x in world px, y in screen px), or null outside the wall. */
  cellAt(x: number, y: number): { col: number; row: number } | null {
    const col = Math.floor(x / CELL);
    const row = this.level.rows + Math.floor((y - this.wallOffsetY) / CELL);
    if (col < 0 || col >= this.level.cols || row < 0 || row >= this.level.rows) return null;
    return { col, row };
  }

  /** The living block under a world position, if any. */
  blockAt(x: number, y: number): Block | null {
    const c = this.cellAt(x, y);
    return c ? this.blocks[c.row * this.level.cols + c.col] : null;
  }

  /** Screen y of the lowest living block's bottom edge (-Infinity when the wall is gone). */
  bottomEdge(): number {
    return this.lowRow < 0 ? -Infinity : this.blockTop(this.lowRow) + CELL;
  }

  private findLowRow(from: number): number {
    let r = from;
    while (r >= 0 && this.rowAlive[r] === 0) r--;
    return r;
  }

  private syncY() {
    for (const b of this.all) b.y = this.blockTop(b.row) + CELL / 2;
  }

  /** Removes a block, pays its credits. Safe to call once per block (a dead block is gone from the grid). */
  destroyBlock(b: Block) {
    const idx = b.row * this.level.cols + b.col;
    if (this.blocks[idx] !== b) return;
    this.blocks[idx] = null;
    b.hp = Math.min(b.hp, 0);
    this.rowAlive[b.row]--;
    this.alive--;
    this.destroyed++;
    if (b.row === this.lowRow && this.rowAlive[b.row] === 0) this.lowRow = this.findLowRow(b.row);
    const reward = rewardPerBlock(this.level.tier);
    this.creditsExact += reward;
    this.killEvents.push({ x: b.x, y: b.y, reward });
  }

  /** Debug/test helper: destroys every living block through the normal path. */
  destroyAll() {
    for (const b of this.all) if (this.blocks[b.row * this.level.cols + b.col] === b) this.destroyBlock(b);
  }

  /** Banks the credits once (win or lose). Returns false when it had already been banked. */
  bank(store: WallBank): boolean {
    if (this.banked) return false;
    this.banked = true;
    store.recordWallRun({ credits: this.credits, kills: this.destroyed });
    return true;
  }

  get isBanked(): boolean { return this.banked; }

  fire() {
    firePulse(this.pool, this.projSys, this.recipes, this.spawnOffsets, this.shipX, this.shipY);
  }

  /**
   * One step. `ship` is where the pointer wants the ship (world x, screen y); null keeps it where it is
   * (touch released). Camera movement is done by the caller before this.
   */
  update(dt: number, ship: ShipTarget | null) {
    if (this.state !== 'playing') return;
    this.time += dt;

    // --- Shields recover after SHIELD_REGEN_DELAY seconds without a hit
    for (const b of this.shielded) {
      if (b.hp > 0 && b.shield < b.maxShield && this.time - b.lastHit >= SHIELD_REGEN_DELAY) {
        b.shield = Math.min(b.maxShield, b.shield + b.maxShield * SHIELD_REGEN_PER_SEC * dt);
      }
    }
    for (const b of this.all) if (b.flash > 0) b.flash -= dt;

    // --- Wall: scrolls down until a living block reaches the stop line, resumes when the line is clear
    if (this.alive > 0) {
      const room = STOP_LINE_Y - this.bottomEdge();
      if (room > EPS) {
        this.wallOffsetY += Math.min(this.level.approachSpeed * dt, room);
        this.syncY();
      }
    }
    this.touching = this.alive > 0 && this.bottomEdge() >= STOP_LINE_Y - EPS;
    if (this.touching) this.hull -= DRAIN_PER_SEC * this.maxHull * dt;

    // --- Ship: follows the pointer, then is pushed out of any block
    if (ship) {
      this.shipX = Math.max(0, Math.min(WORLD_WIDTH, ship.x));
      this.shipY = Math.max(CONFIG.PLAYER.MARGIN, Math.min(VIEW_H - CONFIG.PLAYER.MARGIN, ship.y));
    }
    this.resolveShip();

    // --- Auto-fire
    if (this.autoFire) {
      this.pulseTimer += dt;
      const period = 1 / CONFIG.PULSE.BASE_RATE;
      while (this.pulseTimer >= period) {
        this.pulseTimer -= period;
        this.fire();
      }
    }

    // --- Projectiles: steer, move, keep inside the world, drop the ones that left or flew too long
    const pool = this.pool;
    this.projSys.steer(dt, this.field);
    const wallTop = this.wallOffsetY - this.level.rows * CELL - 100;
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      pool.x[i] += pool.vx[i] * dt;
      pool.y[i] += pool.vy[i] * dt;
      if (pool.x[i] < 0 || pool.x[i] > WORLD_WIDTH) {
        if (this.bounceEdge[pool.modIndex[i]]) {
          if (pool.x[i] < 0) { pool.x[i] = -pool.x[i]; pool.vx[i] = Math.abs(pool.vx[i]); }
          else { pool.x[i] = 2 * WORLD_WIDTH - pool.x[i]; pool.vx[i] = -Math.abs(pool.vx[i]); }
        } else {
          pool.free(i);
          continue;
        }
      }
      if (pool.y[i] < wallTop || pool.y[i] > VIEW_H + 50 || pool.age[i] > PROJECTILE_MAX_AGE) pool.free(i);
    }

    // --- Hits (blocks die inside the hit callback)
    this.projSys.processField(this.field, this.level.tier);

    // --- End of level
    if (this.alive === 0) this.state = 'won';
    else if (this.hull <= 0) { this.hull = 0; this.state = 'lost'; }
  }

  /** Push the ship's circle out of every block it overlaps, along the shortest way out. */
  private resolveShip() {
    const R = CONFIG.PLAYER.HITBOX_R;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      const c0 = Math.max(0, Math.floor((this.shipX - R) / CELL));
      const c1 = Math.min(this.level.cols - 1, Math.floor((this.shipX + R) / CELL));
      const r0 = Math.max(0, this.level.rows + Math.floor((this.shipY - R - this.wallOffsetY) / CELL));
      const r1 = Math.min(this.level.rows - 1, this.level.rows + Math.floor((this.shipY + R - this.wallOffsetY) / CELL));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const b = this.blocks[r * this.level.cols + c];
          if (!b) continue;
          const bx = c * CELL;
          const by = this.blockTop(r);
          const qx = Math.max(bx, Math.min(this.shipX, bx + CELL));
          const qy = Math.max(by, Math.min(this.shipY, by + CELL));
          const dx = this.shipX - qx;
          const dy = this.shipY - qy;
          const d = Math.hypot(dx, dy);
          if (d >= R) continue;
          moved = true;
          if (d > EPS) {
            this.shipX += (dx / d) * (R - d);
            this.shipY += (dy / d) * (R - d);
          } else {
            // Centre inside the block: leave by the nearest face.
            const left = this.shipX - bx;
            const right = bx + CELL - this.shipX;
            const up = this.shipY - by;
            const down = by + CELL - this.shipY;
            const m = Math.min(left, right, up, down);
            if (m === left) this.shipX = bx - R;
            else if (m === right) this.shipX = bx + CELL + R;
            else if (m === up) this.shipY = by - R;
            else this.shipY = by + CELL + R;
          }
        }
      }
      if (!moved) break;
    }
  }
}
