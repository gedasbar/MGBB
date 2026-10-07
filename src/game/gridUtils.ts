import { Grid, GridCell } from '../engine/compiler';

/**
 * Layout legend: `.` void, `_` empty buildable, `X` blocked, `G` generator (faces up), `E` ejector (faces up).
 * Rows are listed top to bottom.
 */
export function parseLayout(rows: string[]): Grid {
  const h = rows.length;
  const w = rows[0].length;
  const cells: GridCell[] = [];
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`Layout row ${y + 1} has the wrong length`);
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const base: GridCell = { x, y, type: 'void', blockId: null, level: 1, rotation: 0, manual: false };
      if (ch === '_') base.type = 'empty';
      else if (ch === 'X') base.type = 'blocked';
      else if (ch === 'G') { base.type = 'generator'; base.facing = 'N'; }
      else if (ch === 'E') { base.type = 'ejector'; base.facing = 'N'; }
      else if (ch !== '.') throw new Error(`Unknown layout character "${ch}"`);
      cells.push(base);
    }
  }
  return { w, h, cells };
}

export const SHUTTLE_ROWS = [
  '.....X.....',
  '..X.X_X.E..',
  '.._______..',
  '.._____._..',
  '.._____._..',
  '.._____._..',
  '.._____._..',
  '.._______..',
  '.._______..',
  '....._.....',
  '.....G.....',
];

export const FAN_ROWS = [
  '.E..E..E.',
  ...new Array(8).fill('_________'),
  '....G....',
];

/** The 11x11 Shuttle hull with nothing placed. */
export function buildShuttleGrid(): Grid {
  return parseLayout(SHUTTLE_ROWS);
}

/** A wide test hull: a full 9x8 buildable area, generator at bottom-centre, three ejectors on the top edge. */
export function buildFanGrid(): Grid {
  return parseLayout(FAN_ROWS);
}

export const HULL_BUILDERS: Record<string, () => Grid> = {
  shuttle: buildShuttleGrid,
  fan: buildFanGrid,
};

export function cloneGrid(g: Grid): Grid {
  return { w: g.w, h: g.h, cells: g.cells.map(c => ({ ...c })) };
}
