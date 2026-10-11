import { Grid, GridCell } from '../engine/compiler';
import { HULL_ORDER } from '../data/hulls';

/**
 * Layout legend: `.` void, `_` empty buildable, `G` generator (faces up), `E` ejector (faces up).
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
      else if (ch === 'G') { base.type = 'generator'; base.facing = 'N'; }
      else if (ch === 'E') { base.type = 'ejector'; base.facing = 'N'; }
      else if (ch !== '.') throw new Error(`Unknown layout character "${ch}"`);
      cells.push(base);
    }
  }
  return { w, h, cells };
}

export const SHUTTLE_ROWS = [
  '...........',
  '....._..E..',
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

/** Dart: the free starter. Generator, ONE free cell, ejector, in a straight line. */
export const DART_ROWS = ['E', '_', 'G'];
/** Twin: two free cells in a line. */
export const TWIN_ROWS = ['E', '_', '_', 'G'];
/**
 * Prong: two ejectors side by side at the top, three free cells, the generator under the left one. A Splitter 3 on the
 * left cell and a Turn Left on the right one feed both prongs.
 */
export const PRONG_ROWS = ['E.E', '___', 'G..'];

export const FAN_ROWS = [
  '.E..E..E.',
  ...new Array(8).fill('_________'),
  '....G....',
];

function withHull(id: string, rows: string[]): Grid {
  const g = parseLayout(rows);
  g.hullId = id;
  return g;
}

export const buildDartGrid = (): Grid => withHull('dart', DART_ROWS);
export const buildTwinGrid = (): Grid => withHull('twin', TWIN_ROWS);
export const buildProngGrid = (): Grid => withHull('prong', PRONG_ROWS);

/** The 11x11 Shuttle hull with nothing placed. */
export function buildShuttleGrid(): Grid {
  return withHull('shuttle', SHUTTLE_ROWS);
}

/** A wide test hull: a full 9x8 buildable area, generator at bottom-centre, three ejectors on the top edge. */
export function buildFanGrid(): Grid {
  return withHull('fan', FAN_ROWS);
}

export interface HullInfo { id: string; name: string; desc: string }

const INFO: Record<string, HullInfo> = {
  dart: { id: 'dart', name: 'Dart', desc: 'The free starter: one free cell between generator and ejector. Slow gun.' },
  twin: { id: 'twin', name: 'Twin', desc: 'Two free cells in a line, full fire rate.' },
  prong: { id: 'prong', name: 'Prong', desc: 'Two ejectors side by side and three free cells: split the signal.' },
  fan: { id: 'fan', name: 'Fan', desc: '9 x 8 open hull with three ejectors, good for splitters.' },
  shuttle: { id: 'shuttle', name: 'Shuttle', desc: '11 x 11 hull with one ejector and room for a long circuit.' },
};

/** In ladder order (cheapest first). */
export const HULL_INFO: HullInfo[] = HULL_ORDER.map(id => INFO[id]);

export const HULL_BUILDERS: Record<string, () => Grid> = {
  dart: buildDartGrid,
  twin: buildTwinGrid,
  prong: buildProngGrid,
  fan: buildFanGrid,
  shuttle: buildShuttleGrid,
};

export function cloneGrid(g: Grid): Grid {
  const out: Grid = { w: g.w, h: g.h, cells: g.cells.map(c => ({ ...c })) };
  if (g.hullId) out.hullId = g.hullId;
  return out;
}
