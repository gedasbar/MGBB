import { CONFIG } from '../config';
import { Grid } from '../engine/compiler';
import { CELL, SHIP_HIT_R, VIEW_H, WALL_COLS } from './constants';
import { LevelDef } from './level';
import { ShipTarget, WallState, WallWorld } from './wallWorld';

/** Which headless pilot plays the level. */
export type BotKind = 'carve' | 'clearAll';

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
export function columnCost(w: WallWorld, col: number): number {
  let sum = 0;
  for (let r = 0; r < w.level.rows; r++) {
    const b = w.blocks[r * w.level.cols + col];
    if (b) sum += blockCost(b);
  }
  return sum;
}

/** Bottom edge (screen y) of the lowest living block of a column, or null if the column is empty. */
export function columnBottom(w: WallWorld, col: number): number | null {
  for (let r = w.level.rows - 1; r >= 0; r--) {
    if (w.blocks[r * w.level.cols + col]) return w.blockTop(r) + CELL;
  }
  return null;
}

/** Where the bot's ship dot must be so that the (first) ejector fires up the middle of a column. */
const dotXFor = (w: WallWorld, col: number) => col * CELL + CELL / 2 - (w.spawnOffsets[0]?.x ?? 0);

const MAX_SPEED = 700; // px/s the pilot can move the ship, both axes
const move = (cur: number, target: number, dt: number) => cur + Math.max(-MAX_SPEED * dt, Math.min(MAX_SPEED * dt, target - cur));

/**
 * Path carver: picks the straight column that is cheapest to destroy (while the wall is still above the screen), shoots up
 * it continuously, and stays just under the lowest live block of that lane, so it climbs the lane as the blocks die and
 * flies up it (at the boost speed, near the top of the screen) once the lane is clear. It never enters a live block.
 */
export class CarveBot {
  private lane = -1;
  private x = 0;
  private y = 0;
  private started = false;

  step(w: WallWorld, dt: number): ShipTarget {
    if (!this.started) { this.x = w.shipX; this.y = w.shipY; this.started = true; }
    if (this.lane < 0 || w.wallOffsetY < 150) {
      let best = Infinity;
      for (let c = 0; c < WALL_COLS; c++) {
        const cost = columnCost(w, c);
        if (cost < best) { best = cost; this.lane = c; }
      }
    }
    const bottom = columnBottom(w, this.lane);
    const wantY = bottom === null ? -200 : bottom + SHIP_HIT_R + 9;
    this.x = move(this.x, dotXFor(w, this.lane), dt);
    this.y = move(this.y, Math.min(wantY, VIEW_H - CONFIG.PLAYER.MARGIN), dt);
    return { x: this.x, y: this.y };
  }
}

/**
 * Clear-all pilot: stays at the bottom of the screen and always aims at the column whose lowest block hangs lowest, so the
 * wall is eaten from the bottom up and nothing reaches the ship while it can be shot.
 */
export class ClearAllBot {
  private x = 0;
  private y = 0;
  private started = false;

  step(w: WallWorld, dt: number): ShipTarget {
    if (!this.started) { this.x = w.shipX; this.y = VIEW_H - CONFIG.PLAYER.MARGIN; this.started = true; }
    let bestCol = -1;
    let bestBottom = -Infinity;
    for (let c = 0; c < WALL_COLS; c++) {
      const b = columnBottom(w, c);
      if (b !== null && b > bestBottom) { bestBottom = b; bestCol = c; }
    }
    if (bestCol >= 0) this.x = move(this.x, dotXFor(w, bestCol), dt);
    this.y = move(this.y, VIEW_H - CONFIG.PLAYER.MARGIN, dt);
    return { x: this.x, y: this.y };
  }
}

/** Plays a level headlessly with a bot until it ends or `maxTime` seconds pass. */
export function simulateWall(level: LevelDef, grid: Grid, bot: BotKind = 'carve', opts: { maxTime?: number; dt?: number } = {}): WallSimResult {
  const dt = opts.dt ?? 1 / 60;
  const maxTime = opts.maxTime ?? 240;
  const world = new WallWorld(level, { grid });
  const pilot = bot === 'carve' ? new CarveBot() : new ClearAllBot();
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
