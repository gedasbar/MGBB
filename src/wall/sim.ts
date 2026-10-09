import { CONFIG } from '../config';
import { Grid } from '../engine/compiler';
import { WORLD_WIDTH } from './constants';
import { LevelDef } from './level';
import { WallWorld } from './wallWorld';

/** A bot that sweeps the ship left and right across the whole wall at a fixed speed while the gun fires. */
export interface SweepBot {
  /** Horizontal speed in px/s. */
  speed: number;
  /** Ship height on screen (below the stop line). */
  y: number;
  /** Seconds it waits at each end of the sweep, so the edge columns get shots too. */
  dwell: number;
}

export const DEFAULT_BOT: SweepBot = { speed: 200, y: CONFIG.VIEW.H * 0.8, dwell: 0.5 };

export interface WallSimResult {
  state: 'won' | 'lost' | 'timeout';
  time: number;
  destroyed: number;
  total: number;
  credits: number;
  hull: number;
  /** Time the wall first touched the stop line, or null if it never did. */
  firstTouch: number | null;
  world: WallWorld;
}

/** Position of a ping-pong sweep between lo and hi after t seconds, pausing `dwell` seconds at each end. */
export function sweepX(t: number, speed: number, lo: number, hi: number, dwell = 0): number {
  const span = hi - lo;
  if (span <= 0 || speed <= 0) return lo;
  const travel = span / speed;
  let u = t % (2 * (travel + dwell));
  if (u < dwell) return lo;
  u -= dwell;
  if (u < travel) return lo + u * speed;
  u -= travel;
  if (u < dwell) return hi;
  return hi - (u - dwell) * speed;
}

/**
 * Plays a wall level headlessly with the sweeping bot until it is won, lost or `maxTime` seconds pass.
 * The bot ignores the camera (it moves in world coordinates directly).
 */
export function simulateWall(level: LevelDef, grid: Grid, bot: SweepBot = DEFAULT_BOT, opts: { maxTime?: number; dt?: number; /** Keep the hull full, to measure how long the gun needs without the drain ending the run. */ immortal?: boolean } = {}): WallSimResult {
  const dt = opts.dt ?? 1 / 60;
  const maxTime = opts.maxTime ?? 300;
  const world = new WallWorld(level, { grid });
  // Sweep so that every ejector can reach every column: stay inside the world by the widest ejector offset.
  const lo = Math.max(0, -Math.min(0, ...world.spawnOffsets.map(o => o.x)));
  const hi = WORLD_WIDTH - 5 - Math.max(0, ...world.spawnOffsets.map(o => o.x));
  let firstTouch: number | null = null;
  while (world.state === 'playing' && world.time < maxTime) {
    world.update(dt, { x: sweepX(world.time, bot.speed, lo, hi, bot.dwell), y: bot.y });
    if (opts.immortal) {
      world.hull = world.maxHull;
      if ((world.state as string) === 'lost') world.state = 'playing';
    }
    if (firstTouch === null && world.touching) firstTouch = world.time;
    world.hits.length = 0;
    world.killEvents.length = 0;
  }
  return {
    state: world.state === 'playing' ? 'timeout' : world.state,
    time: world.time, destroyed: world.destroyed, total: world.total, credits: world.credits, hull: world.hull, firstTouch, world,
  };
}
