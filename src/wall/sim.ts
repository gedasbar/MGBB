import { CONFIG } from '../config';
import { Grid } from '../engine/compiler';
import { wrapDx, wrapX } from '../engine/wrap';
import { CELL, VIEW_H } from './constants';
import { LevelDef } from './level';
import { ShipTarget, WallState, WallWorld } from './wallWorld';
import type { RunModifiers } from '../captains/modifiers';

/** Which headless pilot plays the level. */
/** 'flyer' (chunk 27a): fires nothing and only flies, up the open cells (how a Maze is passed with zero damage). */
export type BotKind = 'carve' | 'clearAll' | 'flyer';

export interface WallSimResult {
  state: WallState | 'timeout';
  time: number;
  destroyed: number;
  total: number;
  credits: number;
  world: WallWorld;
}

/** Effective HP of one block against direct damage: shield first, armor doubles what is left (armor 10 halves damage). */
export const blockCost = (b: { hp: number; shield: number; armor: number }) => Math.max(0, b.shield) + Math.max(0, b.hp) * (1 + b.armor / 10);

/** Total effective HP of the living blocks of a column: what a lane through it costs to carve. */
function columnCost(w: WallWorld, col: number): number {
  let sum = 0;
  for (let r = 0; r < w.level.rows; r++) {
    const b = w.blocks[r * w.level.cols + col];
    if (b) sum += blockCost(b);
  }
  return sum;
}

/** Bottom edge (screen y) of the lowest living block of a column, or null if the column is empty. */
function columnBottom(w: WallWorld, col: number): number | null {
  for (let r = w.level.rows - 1; r >= 0; r--) {
    if (w.blocks[r * w.level.cols + col]) return w.blockTop(r) + CELL;
  }
  return null;
}

/** Where the bot's ship dot must be so that the (first) ejector fires up the middle of a column. */
const dotXFor = (w: WallWorld, col: number) => col * CELL + CELL / 2 - (w.spawnOffsets[0]?.x ?? 0);

const MAX_SPEED = 700; // px/s the pilot can move the ship, both axes
const move = (cur: number, target: number, dt: number) => cur + Math.max(-MAX_SPEED * dt, Math.min(MAX_SPEED * dt, target - cur));
/** Sideways move along the shortest way (round the ring when the wall is one). */
const moveX = (w: WallWorld, cur: number, target: number, dt: number) => {
  const d = Math.max(-MAX_SPEED * dt, Math.min(MAX_SPEED * dt, w.ring ? wrapDx(target, cur, w.worldW) : target - cur));
  return w.ring ? wrapX(cur + d, w.worldW) : cur + d;
};

/**
 * Path carver: picks the straight column that is cheapest to destroy (while the wall is still above the screen), shoots up
 * it continuously, and stays just under the lowest live block of that lane, so it climbs the lane as the blocks die and
 * flies up it (at the boost speed, near the top of the screen) once the lane is clear. It never enters a live block.
 */
class CarveBot {
  private lane = -1;
  private x = 0;
  private y = 0;
  private started = false;

  step(w: WallWorld, dt: number): ShipTarget {
    if (!this.started) { this.x = w.shipX; this.y = w.shipY; this.started = true; }
    if (this.lane < 0 || w.wallOffsetY < 150) {
      let best = Infinity;
      for (let c = 0; c < w.level.cols; c++) {
        const cost = columnCost(w, c);
        if (cost < best) { best = cost; this.lane = c; }
      }
    }
    const bottom = columnBottom(w, this.lane);
    const wantY = bottom === null ? -200 : bottom + w.hitR + 9;
    this.x = moveX(w, this.x, dotXFor(w, this.lane), dt);
    this.y = move(this.y, Math.min(wantY, VIEW_H - CONFIG.PLAYER.MARGIN), dt);
    return { x: this.x, y: this.y };
  }
}

/**
 * Clear-all pilot: stays at the bottom of the screen and always aims at the column whose lowest block hangs lowest, so the
 * wall is eaten from the bottom up and nothing reaches the ship while it can be shot.
 */
class ClearAllBot {
  private x = 0;
  private y = 0;
  private started = false;

  step(w: WallWorld, dt: number): ShipTarget {
    if (!this.started) { this.x = w.shipX; this.y = VIEW_H - CONFIG.PLAYER.MARGIN; this.started = true; }
    let bestCol = -1;
    let bestBottom = -Infinity;
    for (let c = 0; c < w.level.cols; c++) {
      const b = columnBottom(w, c);
      if (b !== null && b > bestBottom) { bestBottom = b; bestCol = c; }
    }
    if (bestCol >= 0) this.x = moveX(w, this.x, dotXFor(w, bestCol), dt);
    this.y = move(this.y, VIEW_H - CONFIG.PLAYER.MARGIN, dt);
    return { x: this.x, y: this.y };
  }
}

/**
 * Zero-damage pilot (chunk 27a): never fires; climbs at FLYER_SPEED and keeps sideways in the open cells shared by the rows the ship
 * overlaps (and the one just above it), so it follows a Maze path. Not a general pathfinder: it needs rows that overlap.
 */
const FLYER_SPEED = 160;
const FLYER_LOOKAHEAD_ROWS = 3;
class FlyerBot {
  private x = 0;
  private y = 0;
  private started = false;

  private open(w: WallWorld, row: number): boolean[] {
    const out: boolean[] = [];
    for (let c = 0; c < w.level.cols; c++) out.push(row < 0 || row >= w.level.rows || !w.blocks[row * w.level.cols + c]);
    return out;
  }

  step(w: WallWorld, dt: number): ShipTarget {
    if (!this.started) { this.x = w.shipX; this.y = w.shipY; this.started = true; }
    const cols = w.level.cols;
    const rowOf = (y: number) => w.level.rows + Math.floor((y - w.wallOffsetY) / CELL);
    const rLow = rowOf(this.y + w.hitR);
    const rHigh = rowOf(this.y - w.hitR - 14);
    let shared = new Array<boolean>(cols).fill(true);
    for (let r = rHigh; r <= rLow; r++) { const o = this.open(w, r); shared = shared.map((v, c) => v && o[c]); }
    // Where the path is heading a few rows ahead (or at the bottom row of the wall while the ship is still below it): the centre of the open run nearest the ship.
    const lookRow = Math.min(w.level.rows - 1, rowOf(this.y - w.hitR) - FLYER_LOOKAHEAD_ROWS);
    const ahead = this.open(w, lookRow);
    const runCentre = (set: boolean[], from: number): number => {
      let best = -1, bestD = Infinity;
      for (let c = 0; c < cols; c++) {
        if (!set[c]) continue;
        const d = Math.abs(w.dxw(c * CELL + CELL / 2, from));
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best < 0) return from;
      let a = 0, b = 0;
      while (a > -cols && set[(((best + a - 1) % cols) + cols) % cols]) a--;
      while (b < cols && set[(best + b + 1) % cols]) b++;
      if (b - a + 1 >= cols) return from;
      return from + w.dxw((best + (a + b) / 2) * CELL + CELL / 2, from);
    };
    const wanted = lookRow >= 0 ? runCentre(ahead, this.x) : this.x;
    // Inside the cells the ship overlaps, go to the point nearest that: the nearest run of shared open cells, clamped to its middle part.
    let targetX = wanted;
    if (!shared.every(Boolean)) {
      let best = -1, bestD = Infinity;
      for (let c = 0; c < cols; c++) {
        if (!shared[c]) continue;
        const d = Math.abs(w.dxw(c * CELL + CELL / 2, wanted));
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best >= 0) targetX = wanted + w.dxw(best * CELL + CELL / 2, wanted);
    }
    this.x = moveX(w, this.x, targetX, dt);
    this.y = Math.max(CONFIG.PLAYER.MARGIN, move(this.y, this.y - FLYER_SPEED * 2, dt * FLYER_SPEED / MAX_SPEED)); // the screen's top edge is as far as a ship goes
    return { x: this.x, y: this.y };
  }
}

/** Plays a level headlessly with a bot until it ends or `maxTime` seconds pass. */
export function simulateWall(level: LevelDef, grid: Grid, bot: BotKind = 'carve', opts: { maxTime?: number; dt?: number; modifiers?: RunModifiers; /** Tests: called with the world before the first step. */ prep?: (w: WallWorld) => void } = {}): WallSimResult {
  const dt = opts.dt ?? 1 / 60;
  const maxTime = opts.maxTime ?? 240;
  const world = new WallWorld(level, { grid, modifiers: opts.modifiers });
  const pilot = bot === 'carve' ? new CarveBot() : bot === 'clearAll' ? new ClearAllBot() : new FlyerBot();
  if (bot === 'flyer') world.autoFire = false;
  opts.prep?.(world);
  while (world.state === 'playing' && world.time < maxTime) {
    world.update(dt, pilot.step(world, dt));
    world.hits.length = 0;
    world.killEvents.length = 0;
  }
  return {
    state: world.state === 'playing' ? 'timeout' : world.state,
    time: world.time, destroyed: world.destroyed, total: world.total, credits: world.credits, world,
  };
}
