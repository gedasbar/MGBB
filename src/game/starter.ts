import { Grid } from '../engine/compiler';
import '../data/blocks';
import { orientCell } from '../engine/orient';
import { buildDartGrid, buildShuttleGrid, HULL_BUILDERS } from './gridUtils';

/** First-tier Mitotic Rock HP (tests). Starter shot = 2 dmg → 3 hits to kill. */
export const ROCK_HP = 5;
export const ROCK_RADIUS = 20;

/** Places a block by 1-indexed (col,row), as the hull diagram numbers cells. It faces the way the signal reaches the cell NOW, so place blocks in path order. */
export function place(grid: Grid, col: number, row: number, blockId: string, level = 1) {
  const c = grid.cells[(row - 1) * grid.w + (col - 1)];
  c.blockId = blockId;
  c.level = level;
  c.rotation = 0;
  orientCell(grid, col - 1, row - 1);
}

/**
 * Default circuit of the Shuttle: the signal leaves the generator at (6,11), turns right at (6,9),
 * turns left at (9,9) (column 10 is void, so a second turn is needed to reach the ejector), runs up
 * column 9 through Flat+ at (9,6) and into the ejector at (9,2). Every block faces the way the signal reaches it.
 */
export function buildStarterGrid(): Grid {
  const g = buildShuttleGrid();
  place(g, 6, 9, 'turn_r');
  place(g, 9, 9, 'turn_l');
  place(g, 9, 6, 'flat_plus');
  return g;
}

/**
 * The fresh-save circuit: the Dart with a Flat+ in its one free cell (the slot starts empty; the new player is given one
 * Flat+, and this is what they build first). Used by the balance scripts as "the starter gun".
 */
export function buildDartStarterGrid(): Grid {
  const g = buildDartGrid();
  place(g, 1, 2, 'flat_plus');
  return g;
}

/**
 * A hull with the plainest circuit that feeds one ejector: the shortest straight-and-turn path from the generator (which
 * only emits upward) to ejector number `ejector` (reading order), with a Turn Left / Turn Right at every corner and nothing
 * else. Null when no such path exists. Tests use it to prove every layout of the hull ladder can be routed.
 */
export function buildPathGrid(hullId: string, ejector = 0): Grid | null {
  const g = HULL_BUILDERS[hullId]();
  const gen = g.cells.find(c => c.type === 'generator')!;
  const target = g.cells.filter(c => c.type === 'ejector')[ejector];
  if (!target) return null;
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N, E, S, W
  interface Step { x: number; y: number; d: number; path: [number, number][] }
  const queue: Step[] = [{ x: gen.x, y: gen.y, d: 0, path: [[gen.x, gen.y]] }];
  const seen = new Set<string>([`${gen.x},${gen.y},0`]);
  let found: Step | null = null;
  while (queue.length && !found) {
    const s = queue.shift()!;
    for (const nd of [s.d, (s.d + 1) % 4, (s.d + 3) % 4]) {
      if (s.path.length === 1 && nd !== 0) continue;
      const nx = s.x + dirs[nd][0], ny = s.y + dirs[nd][1];
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const c = g.cells[ny * g.w + nx];
      if (c.type === 'void' || c.type === 'generator' || seen.has(`${nx},${ny},${nd}`)) continue;
      seen.add(`${nx},${ny},${nd}`);
      if (c.type === 'ejector') { if (c === target && nd === 0) found = { x: nx, y: ny, d: nd, path: [...s.path, [nx, ny]] }; continue; }
      queue.push({ x: nx, y: ny, d: nd, path: [...s.path, [nx, ny]] });
    }
  }
  if (!found) return null;
  for (let i = 1; i < found.path.length - 1; i++) {
    const [px, py] = found.path[i - 1], [cx, cy] = found.path[i], [nx, ny] = found.path[i + 1];
    const d1x = cx - px, d1y = cy - py, d2x = nx - cx, d2y = ny - cy;
    if (d1x === d2x && d1y === d2y) continue;
    place(g, cx + 1, cy + 1, d1x * d2y - d1y * d2x > 0 ? 'turn_r' : 'turn_l');
  }
  return g;
}
