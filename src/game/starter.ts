import { Grid } from '../engine/compiler';
import '../data/blocks';
import { buildDartGrid, buildShuttleGrid } from './gridUtils';

/** First-tier Mitotic Rock HP (tests). Starter shot = 2 dmg → 3 hits to kill. */
export const ROCK_HP = 5;
export const ROCK_RADIUS = 20;

/** Places a block by 1-indexed (col,row), as the hull diagram numbers cells. */
export function place(grid: Grid, col: number, row: number, blockId: string, level = 1) {
  const c = grid.cells[(row - 1) * grid.w + (col - 1)];
  c.blockId = blockId;
  c.level = level;
  c.rotation = 0;
  c.manual = false;
}

/**
 * Default circuit of the Shuttle: the signal leaves the generator at (6,11), turns right at (6,9),
 * turns left at (9,9) (column 10 is void, so a second turn is needed to reach the ejector), runs up
 * column 9 through Flat+ at (9,6) and into the ejector at (9,2). Every block is in auto mode.
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
