// Chunk 21b: the owner's slow build for the performance scripts and tests. A tall test hull (9 wide, 3 ejectors on the top row) with
// the blocks in path order up the middle column, then a Splitter 3 whose left and right outputs turn up into the side ejectors.
// Shots reach the pool limit with: +1 Projectile (up to 10 copies), Mirror, Fork on Impact, 2 Bouncing, 3 Homing, 2 Extender.
import { parseLayout } from '../../src/game/gridUtils';
import { place } from '../../src/game/starter';
import type { Grid } from '../../src/engine/compiler';

export const PERF_ROWS = 24;

export function perfHull(): Grid {
  const rows = ['.E..E..E.'];
  for (let r = 2; r < PERF_ROWS; r++) rows.push('_________');
  rows.push('....G....');
  return parseLayout(rows);
}

export interface PerfBuild { plusOne: number; mirror: boolean; fork: boolean; bouncing: number; homing: number; extender: number; extra?: string[] }

/** The owner's build: 10 +1 Projectile, Mirror, Fork on Impact, 2 Bouncing, 3 Homing, 2 Extender. */
export const OWNER_BUILD: PerfBuild = { plusOne: 10, mirror: true, fork: true, bouncing: 2, homing: 3, extender: 2 };

export function perfGrid(b: PerfBuild): Grid {
  const g = perfHull();
  const pre: string[] = [];
  for (let k = 0; k < b.plusOne; k++) pre.push('plus_one');
  if (b.mirror) pre.push('mirror');
  for (let k = 0; k < b.extender; k++) pre.push('extender');
  for (let k = 0; k < b.bouncing; k++) pre.push('bouncing');
  for (let k = 0; k < b.homing; k++) pre.push('homing');
  if (b.fork) pre.push('fork_impact');
  pre.push(...(b.extra ?? []));
  place(g, 5, PERF_ROWS - 1, 'flat_plus');
  pre.forEach((id, k) => place(g, 5, PERF_ROWS - 2 - k, id));
  const row = PERF_ROWS - 2 - pre.length;
  place(g, 5, row, 'splitter_3');
  place(g, 2, row, 'turn_r');
  place(g, 8, row, 'turn_l');
  return g;
}

/**
 * Keeps the pool at `target` shots (the benches measure the cost of N shots, not of whatever the circuit happens to reach): fires the
 * recipes round-robin, at the ship, through the gun's own spawn (so Mirror clones, lane offsets and Extender life are the real ones).
 */
export function topUp(w: { gun: any; pool: { count: number }; recipes: { packet: { damage: number } }[]; shipX: number; shipY: number }, target: number) {
  let ri = 0;
  while (w.pool.count < target) {
    const before = w.pool.count;
    w.gun.spawn(ri % w.recipes.length, w.recipes[ri % w.recipes.length].packet.damage, w.shipX, w.shipY);
    ri++;
    if (w.pool.count === before) break;
  }
}
