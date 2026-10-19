import { compile, Grid } from './compiler';
import { Dir, dirToRotation, Rotation } from './compilerTypes';

/**
 * Chunk 16a: orientation is stored, never worked out while compiling. These helpers are the only places that work a
 * direction out: when a block is placed, when the player presses Auto-orient on one block, and when an old save (where
 * blocks could be "auto") is loaded. All of them look at the circuit as it is NOW and change nothing else.
 */

/** The way a signal travels into a cell, or null when no signal passes through it. The cell is treated as empty (a straight piece), so a block already there does not matter. */
export function entryDirection(grid: Grid, x: number, y: number): Dir | null {
  const idx = y * grid.w + x;
  const c = grid.cells[idx];
  if (c.type !== 'empty') return null;
  const had = c.blockId;
  c.blockId = null;
  try {
    return compile(grid).cellInfo[idx].inDirs[0] ?? null;
  } finally {
    c.blockId = had;
  }
}

/** The rotation a block placed in this cell should get: it faces the way the signal arrives. With no signal there, `fallback` (the rotation it has). */
export function orientationFor(grid: Grid, x: number, y: number, fallback: Rotation = 0): Rotation {
  const d = entryDirection(grid, x, y);
  return d ? dirToRotation(d) : fallback;
}

/** Sets the rotation of ONE block from the circuit as it is now (placement, and the Auto-orient button). */
export function orientCell(grid: Grid, x: number, y: number) {
  const c = grid.cells[y * grid.w + x];
  c.rotation = orientationFor(grid, x, y, c.rotation);
}

/**
 * Old saves: orients the given block cells (those that were in auto mode) against the circuit as saved, once. Blocks the
 * signal reaches are fixed in path order, so a block after a turn sees the line the turn makes; the rest keep their rotation.
 */
export function orientLegacyAuto(grid: Grid, autoIdx: number[]) {
  const pending = new Map<number, string>();
  for (const i of autoIdx) {
    const c = grid.cells[i];
    if (c.blockId) { pending.set(i, c.blockId); c.blockId = null; }
  }
  try {
    for (let guard = pending.size + 1; guard > 0 && pending.size > 0; guard--) {
      const info = compile(grid).cellInfo;
      const reached = [...pending.keys()].filter(i => info[i].inDirs.length > 0);
      if (reached.length === 0) break;
      for (const i of reached) {
        grid.cells[i].rotation = dirToRotation(info[i].inDirs[0]);
        grid.cells[i].blockId = pending.get(i)!;
        pending.delete(i);
      }
    }
  } finally {
    for (const [i, id] of pending) grid.cells[i].blockId = id; // never reached: keeps the rotation it had
  }
}

/** Orients EVERY block of a grid against its circuit in path order, once (tools that build many circuits at once, such as the balance bots, and presets). */
export function orientAll(grid: Grid) {
  const idx: number[] = [];
  grid.cells.forEach((c, i) => { if (c.type === 'empty' && c.blockId) idx.push(i); });
  orientLegacyAuto(grid, idx);
}
