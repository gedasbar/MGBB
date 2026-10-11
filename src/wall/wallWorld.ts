import { CONFIG } from '../config';
import { compile, EjectorRecipe, Grid } from '../engine/compiler';
import { ProjectilePool } from '../engine/pools';
import { EnemyEntity, ProjectileSystem } from '../engine/projectiles';
import { BounceInfo, TargetField } from '../engine/targets';
import { Gun, spawnOffsetsFor } from '../game/fire';
import { HIT_BURN } from '../engine/projectiles';
import { buildStarterGrid } from '../game/starter';
import {
  BOOST_MAX, CELL, PASS_MARGIN_CELLS, PROJECTILE_MAX_AGE, SHIELD_REGEN_DELAY, SHIELD_REGEN_PER_SEC, SHIP_HIT_R, SHIP_START_Y, TOP_ZONE, VIEW_H,
} from './constants';
import { LevelDef, rewardPerBlock } from './level';
import { easeK, EASE_TIME, GRACE_TIME } from '../engine/control';
import { fireRateMul } from '../data/hulls';
import { wrapDx, wrapX } from '../engine/wrap';

/** One living block of a wall. x/y are the block centre (x in world px, y in screen px); `radius` is the half size. */
export interface Block extends EnemyEntity {
  col: number;
  row: number;
  /** World time of the last hit (shield regeneration waits SHIELD_REGEN_DELAY after it). */
  lastHit: number;
  /** Seconds of hit flash left (drawing only). */
  flash: number;
}

export interface WallHitEvent { blockId: number; damage: number; x: number; y: number; kind: number }
export interface WallKillEvent { x: number; y: number; reward: number }
/** How a level ends: every block destroyed, the ship flew past the end of the wall, or the ship touched a live block. */
export type WallState = 'playing' | 'cleared' | 'passed' | 'crashed';

/** 0 with the ship at TOP_ZONE x viewport height or lower, 1 at the top edge of the screen, linear in between. */
export function boostT(shipY: number): number {
  const zone = TOP_ZONE * VIEW_H;
  return Math.max(0, Math.min(1, (zone - shipY) / zone));
}

/** Wall scroll speed in px/s for a base speed and the ship's height. */
export function scrollSpeed(base: number, shipY: number): number {
  return base * (1 + (BOOST_MAX - 1) * boostT(shipY));
}

/** What the world needs from the progress store at the end of a level. */
export interface WallBank {
  recordWallRun(run: { credits: number; kills: number; tier?: number; destroyed?: number; total?: number; time?: number; passed?: boolean }): { medal: boolean } | void;
}

/** Ship position the pointer asks for, in world px (x) and screen px (y). */
export interface ShipTarget { x: number; y: number }

const FLASH_TIME = 0.08;
const EPS = 1e-6;


/**
 * The wall as a set of targets for the shared hit pipeline: projectile position -> grid cell lookup,
 * no spatial hash. Only living blocks are ever returned.
 */
export class BlockField implements TargetField {
  constructor(private w: WallWorld) {}

  private forEachIn(x0: number, y0: number, x1: number, y1: number, fn: (b: Block) => void) {
    const w = this.w;
    const cols = w.level.cols;
    let c0 = Math.floor(x0 / CELL);
    let c1 = Math.floor(x1 / CELL);
    if (w.ring) { if (c1 - c0 + 1 >= cols) { c0 = 0; c1 = cols - 1; } } else { c0 = Math.max(0, c0); c1 = Math.min(cols - 1, c1); }
    const r0 = Math.max(0, w.level.rows + Math.floor((y0 - w.wallOffsetY) / CELL));
    const r1 = Math.min(w.level.rows - 1, w.level.rows + Math.floor((y1 - w.wallOffsetY) / CELL));
    for (let r = r1; r >= r0; r--) {
      for (let c = c0; c <= c1; c++) {
        const b = w.blocks[r * cols + (w.ring ? ((c % cols) + cols) % cols : c)];
        if (b) fn(b);
      }
    }
  }

  hitCircle(px: number, py: number, hitR: number, skipId: number): EnemyEntity | null {
    let best: Block | null = null;
    let bestD = hitR * hitR;
    this.forEachIn(px - hitR, py - hitR, px + hitR, py + hitR, b => {
      if (b.id === skipId) return;
      const d = this.w.boxDistSq(px, py, b.col, b.row);
      if (d <= bestD) { bestD = d; best = b; }
    });
    return best;
  }

  collectCircle(px: number, py: number, r: number, out: EnemyEntity[]) {
    out.length = 0;
    this.forEachIn(px - r, py - r, px + r, py + r, b => {
      if (this.w.boxDistSq(px, py, b.col, b.row) <= r * r) out.push(b);
    });
  }

  collectRect(px: number, py: number, w: number, h: number, out: EnemyEntity[]) {
    out.length = 0;
    this.forEachIn(px - w / 2, py - h / 2, px + w / 2, py + h / 2, b => {
      if (Math.abs(this.w.dxw(b.x, px)) <= w / 2 + CELL / 2 && Math.abs(b.y - py) <= h / 2 + CELL / 2) out.push(b);
    });
  }

  collectNear(px: number, py: number, range: number, out: EnemyEntity[]) {
    out.length = 0;
    this.forEachIn(px - range, py - range, px + range, py + range, b => { out.push(b); });
  }

  bounceInfo(t: EnemyEntity, px: number, py: number, r: number): BounceInfo | null {
    const b = t as Block;
    const h = CELL / 2;
    const by = this.w.blockTop(b.row);
    // Position relative to the block centre (the short way round on a ring).
    const rx = this.w.dxw(px, b.col * CELL + h);
    const qx = Math.max(-h, Math.min(rx, h));
    const qy = Math.max(by, Math.min(py, by + CELL));
    const dx = rx - qx;
    const dy = py - qy;
    const d = Math.hypot(dx, dy);
    if (d > EPS) return { nx: dx / d, ny: dy / d, push: Math.max(0, r - d) + 0.5 };
    // Centre inside the block: leave through the nearest face.
    const faces = [
      { d: rx + h, nx: -1, ny: 0 }, { d: h - rx, nx: 1, ny: 0 },
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
  readonly gun: Gun;
  readonly warnings: string[];
  readonly spawnOffsets: { x: number; y: number }[];
  readonly field = new BlockField(this);
  /** Ring wall (the level's `wrap`, default true): x wraps at `worldW`. */
  readonly ring: boolean;
  /** Width of the wall in px: cols x CELL. */
  readonly worldW: number;

  /** Row-major living blocks (null = empty or destroyed). */
  readonly blocks: (Block | null)[] = [];
  /** Dev cheat (debugHooks.god): the ship cannot crash. */
  god = false;
  /** Every block ever created, for iteration. */
  readonly all: Block[] = [];
  /** Blocks with a shield pool (regeneration only walks these). */
  private shielded: Block[] = [];
  private rowAlive: number[];
  private lowRow = -1;

  /** Screen y of the wall's bottom edge. The wall starts fully above the screen (offset 0) and moves down. */
  wallOffsetY = 0;
  shipX: number;
  shipY = SHIP_START_Y;
  time = 0;
  state: WallState = 'playing';
  /**
   * Spawn safety. With `safeStart` the ship stays at its start spot (bottom centre) and ignores the pointer until
   * beginControl() (the screen calls it on the first pointer move or press). Then it eases to the pointer over EASE_TIME and
   * cannot crash into blocks for GRACE_TIME (`invuln`, in seconds). Without it (unit tests) the ship follows at once.
   */
  controlStarted: boolean;
  invuln = 0;
  private controlT: number;
  private easeFrom = { x: 0, y: 0 };

  readonly total: number;
  alive: number;
  destroyed = 0;
  creditsExact = 0;
  private banked = false;
  /** True when banking this level awarded a first-clear Medal. */
  medalEarned = false;
  autoFire = true;
  /** Pulse-rate multiplier of the hull being flown (the Dart is slow). */
  private fireRateMul = 1;
  private pulseTimer = 0;

  /** Events produced by update(); consumers clear them. */
  hits: WallHitEvent[] = [];
  killEvents: WallKillEvent[] = [];

  constructor(readonly level: LevelDef, opts: { grid?: Grid; safeStart?: boolean } = {}) {
    this.controlStarted = !opts.safeStart;
    this.controlT = opts.safeStart ? 0 : Infinity;
    this.ring = level.wrap !== false;
    this.worldW = level.cols * CELL;
    this.shipX = this.worldW / 2;
    this.projSys.wrapW = this.ring ? this.worldW : 0;
    const hullGrid = opts.grid ?? buildStarterGrid();
    this.fireRateMul = fireRateMul(hullGrid.hullId);
    const compiled = compile(opts.grid ?? buildStarterGrid());
    this.recipes = compiled.recipes;
    this.warnings = compiled.warnings;
    this.spawnOffsets = spawnOffsetsFor(this.recipes, hullGrid);
    this.projSys.modifiersTable = this.recipes.map(r => r.packet.mods);
    this.gun = new Gun(this.pool, this.projSys, this.recipes, this.spawnOffsets, 1 / (CONFIG.PULSE.BASE_RATE * this.fireRateMul));

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

    this.projSys.onHit = (e, dmg, x, y, kind = 0) => {
      const b = e as Block;
      // A burn tick hurts the block but does not flash it or hold back its shield regeneration.
      if (kind !== HIT_BURN) { b.lastHit = this.time; b.flash = FLASH_TIME; }
      this.hits.push({ blockId: b.id, damage: dmg, x, y, kind });
      if (b.hp <= 0) this.destroyBlock(b);
    };
  }

  /** Screen y of the (invisible) pass line: PASS_MARGIN_CELLS of empty space beyond the last row. The ship passes by flying above it. */
  get finishY(): number { return this.wallOffsetY - this.level.rows * CELL - PASS_MARGIN_CELLS * CELL; }

  /** How far through the wall the ship is, 0 (at the start) to 1 (at the pass line). */
  get progress(): number {
    const startFinishY = -this.level.rows * CELL - PASS_MARGIN_CELLS * CELL;
    return Math.max(0, Math.min(1, 1 - (this.shipY - this.finishY) / (SHIP_START_Y - startFinishY)));
  }

  get tier(): number { return this.level.tier; }
  /** Whole credits earned so far. */
  get credits(): number { return Math.floor(this.creditsExact + 1e-9); }
  get percentDestroyed(): number { return this.total === 0 ? 100 : (this.destroyed / this.total) * 100; }

  /** Screen y of the top edge of a row. */
  blockTop(row: number): number { return this.wallOffsetY - (this.level.rows - row) * CELL; }

  /** Signed x distance from b to a: the short way round on a ring, plain a - b on a flat wall. */
  dxw(a: number, b: number): number {
    return this.ring ? wrapDx(a, b, this.worldW) : a - b;
  }

  /** Squared distance from a point (world x, screen y) to the box of a cell. */
  boxDistSq(px: number, py: number, col: number, row: number): number {
    const dx = Math.max(0, Math.abs(this.dxw(px, col * CELL + CELL / 2)) - CELL / 2);
    const by = this.blockTop(row);
    const dy = py - Math.max(by, Math.min(py, by + CELL));
    return dx * dx + dy * dy;
  }

  /** Grid cell under a world position (x in world px, y in screen px), or null outside the wall (never sideways on a ring). */
  cellAt(x: number, y: number): { col: number; row: number } | null {
    let col = Math.floor(x / CELL);
    if (this.ring) col = ((col % this.level.cols) + this.level.cols) % this.level.cols;
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

  /** Moves the wall to a given scroll offset (tests and debugging). */
  setWallOffset(y: number) {
    this.wallOffsetY = y;
    this.syncY();
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
    const campaign = this.level.campaign;
    const res = store.recordWallRun({
      credits: this.credits, kills: this.destroyed,
      ...(campaign ? { tier: this.level.tier, destroyed: this.destroyed, total: this.total, time: this.time, passed: this.state === 'passed' } : {}),
    });
    this.medalEarned = !!(res && res.medal);
    return true;
  }

  /** The player's first move: the ship starts easing to the pointer and cannot crash for GRACE_TIME. */
  beginControl() {
    if (this.controlStarted) return;
    this.controlStarted = true;
    this.controlT = 0;
    this.invuln = GRACE_TIME;
  }

  get isBanked(): boolean { return this.banked; }

  fire() {
    this.gun.fire(this.shipX, this.shipY);
  }

  /**
   * One step. `ship` is where the pointer wants the ship (world x, screen y); null keeps it where it is (touch released).
   * Camera movement is done by the caller before this. The ship moves freely: blocks do not stop it, they end the run.
   */
  update(dt: number, ship: ShipTarget | null) {
    if (this.state !== 'playing') return;
    this.time += dt;

    // --- Ship: exactly where the pointer asks (inside the world and the screen)
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (ship && this.controlStarted) {
      let tx = this.ring ? wrapX(ship.x, this.worldW) : Math.max(0, Math.min(this.worldW, ship.x));
      let ty = Math.max(CONFIG.PLAYER.MARGIN, Math.min(VIEW_H - CONFIG.PLAYER.MARGIN, ship.y));
      if (this.controlT < EASE_TIME) {
        if (this.controlT === 0) this.easeFrom = { x: this.shipX, y: this.shipY };
        this.controlT += dt;
        const k = easeK(this.controlT);
        tx = this.easeFrom.x + this.dxw(tx, this.easeFrom.x) * k;
        ty = this.easeFrom.y + (ty - this.easeFrom.y) * k;
        if (this.ring) tx = wrapX(tx, this.worldW);
      }
      this.shipX = tx;
      this.shipY = ty;
    }

    // --- Shields recover after SHIELD_REGEN_DELAY seconds without a hit
    for (const b of this.shielded) {
      if (b.hp > 0 && b.shield < b.maxShield && this.time - b.lastHit >= SHIELD_REGEN_DELAY) {
        b.shield = Math.min(b.maxShield, b.shield + b.maxShield * SHIELD_REGEN_PER_SEC * dt);
      }
    }
    for (const b of this.all) if (b.flash > 0) b.flash -= dt;

    // --- Wall: always approaching, faster the higher the ship is on the screen
    this.wallOffsetY += scrollSpeed(this.level.approachSpeed, this.shipY) * dt;
    this.syncY();

    // --- Auto-fire (the gun also releases shots a Delay Line held back)
    this.projSys.shipX = this.shipX;
    this.projSys.shipY = this.shipY;
    this.gun.update(dt, this.shipX, this.shipY);
    if (this.autoFire) {
      this.pulseTimer += dt;
      const period = 1 / (CONFIG.PULSE.BASE_RATE * this.fireRateMul);
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
      if (this.ring) pool.x[i] = wrapX(pool.x[i], this.worldW);
      else if (pool.x[i] < 0 || pool.x[i] > this.worldW) {
        if (this.projSys.modifiersTable[pool.modIndex[i]]?.some(m => m.type === 'bouncing')) {
          if (pool.x[i] < 0) { pool.x[i] = -pool.x[i]; pool.vx[i] = Math.abs(pool.vx[i]); }
          else { pool.x[i] = 2 * this.worldW - pool.x[i]; pool.vx[i] = -Math.abs(pool.vx[i]); }
        } else {
          pool.free(i);
          continue;
        }
      }
      if (pool.y[i] < wallTop || pool.y[i] > VIEW_H + 50 || pool.age[i] > PROJECTILE_MAX_AGE) pool.free(i);
    }

    // --- Burn ticks, freeze timers, arc lifetimes (blocks die inside the hit callback)
    this.projSys.updateStatus(dt);

    // --- Hits (blocks die inside the hit callback)
    this.projSys.processField(this.field, this.level.tier);

    // --- End of level. Destroyed blocks never kill; a cleared wall beats a crash and a pass.
    if (this.alive === 0) this.state = 'cleared';
    else if (this.invuln <= 0 && !this.god && this.shipHitsBlock()) this.state = 'crashed';
    else if (this.shipY < this.finishY) this.state = 'passed';
  }

  /** True if the ship's hit point overlaps the cell of a living block. */
  shipHitsBlock(): boolean {
    const R = SHIP_HIT_R;
    const x = this.shipX;
    const y = this.shipY;
    const cols = this.level.cols;
    let c0 = Math.floor((x - R) / CELL);
    let c1 = Math.floor((x + R) / CELL);
    if (!this.ring) { c0 = Math.max(0, c0); c1 = Math.min(cols - 1, c1); }
    const r0 = Math.max(0, this.level.rows + Math.floor((y - R - this.wallOffsetY) / CELL));
    const r1 = Math.min(this.level.rows - 1, this.level.rows + Math.floor((y + R - this.wallOffsetY) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cc = this.ring ? ((c % cols) + cols) % cols : c;
        if (this.blocks[r * cols + cc] && this.boxDistSq(x, y, cc, r) < R * R) return true;
      }
    }
    return false;
  }
}
