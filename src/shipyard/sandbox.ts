import type { Progress } from '../econ/progress';
import { BLOCKS } from '../data/blocks';
import { maxLevelOf } from '../econ/economy';
import { setCustomHull } from '../data/hulls';
import { HULL_BUILDERS, withHull } from '../game/gridUtils';
import { basePulses, sizeOfChunks } from './design';
import { CELL_TEST_HULL, SANDBOX_COPIES } from './constants';

/**
 * Debug sandbox of the Shipyard's cell mode (chunk 31c, `?debug=1` only): a hand-drawn layout is loaded into the real circuit builder as a temporary hull, with every block free and
 * unlimited, so a circuit can be built in it and flown. Nothing of it reaches the player's saved circuits or inventory: the sandbox builder works on its own in-memory
 * copy of the progress and its own circuits (no storage), see `enterSandbox` in builder/session.ts. This file is the pure part (no Pixi, no DOM).
 */

/** A copy of the progress in which every block is owned SANDBOX_COPIES times at its highest level (owning a block also lifts its tier and Frontier lock). The real progress is not touched. */
export function sandboxProgress(real: Progress): Progress {
  const p = JSON.parse(JSON.stringify(real)) as Progress;
  for (const id of Object.keys(BLOCKS)) {
    p.owned[id] = SANDBOX_COPIES;
    p.levels[id] = maxLevelOf(id);
  }
  if (!p.ownedHulls.includes(CELL_TEST_HULL)) p.ownedHulls.push(CELL_TEST_HULL);
  p.notice = undefined;
  return p;
}

/** Registers the throw-away hull `celltest` for a layout: its stats where the hull lookups read them, and its builder. The same for "Fly test" and the sandbox. */
export function registerCellTest(rows: string[]) {
  const cells = rows.join('').split('_').length - 1;
  setCustomHull(CELL_TEST_HULL, {
    name: 'Cell test', rows, damageMul: 1, lives: 0, coresMul: 1,
    stats: { name: 'Cell test', price: 0, pulsesPerSec: basePulses(cells), shotSpeed: 1, size: sizeOfChunks(Math.ceil(cells / 9)) },
  });
  HULL_BUILDERS[CELL_TEST_HULL] = () => withHull(CELL_TEST_HULL, rows);
}

export function unregisterCellTest() {
  setCustomHull(CELL_TEST_HULL, null);
  delete HULL_BUILDERS[CELL_TEST_HULL];
}

/** The cell-mode layout kept while the sandbox is open, so leaving it returns to cell mode with the layout intact. */
export interface CellSnapshot { w: number; h: number; rows: string[] }
let remembered: CellSnapshot | null = null;
export const rememberCells = (s: CellSnapshot) => { remembered = { w: s.w, h: s.h, rows: [...s.rows] }; };
/** The remembered layout, once (null when there is none). */
export function takeRememberedCells(): CellSnapshot | null { const s = remembered; remembered = null; return s; }
