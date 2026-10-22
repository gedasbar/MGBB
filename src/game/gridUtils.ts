import { Grid, GridCell } from '../engine/compiler';
import { HULL_ORDER, HULLS } from '../data/hulls';
import {
  BASTION_ROWS, CITADEL_ROWS, CORVETTE_ROWS, GALLEON_ROWS, HALBERD_ROWS, HORNET_ROWS, KESTREL_ROWS, LANCET_ROWS, LEVIATHAN_ROWS, MANTIS_ROWS,
  SPIRE_ROWS, TRIDENT_ROWS, WISP_ROWS, ZENITH_ROWS,
} from '../data/hullLayouts';

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
      const base: GridCell = { x, y, type: 'void', blockId: null, level: 1, rotation: 0 };
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

/** Layout rows of every hull, by id (the 17a hulls live in data/hullLayouts.ts). */
export const HULL_ROWS: Record<string, string[]> = {
  dart: DART_ROWS, twin: TWIN_ROWS, prong: PRONG_ROWS, wisp: WISP_ROWS, hornet: HORNET_ROWS, lancet: LANCET_ROWS, kestrel: KESTREL_ROWS,
  mantis: MANTIS_ROWS, bastion: BASTION_ROWS, halberd: HALBERD_ROWS, corvette: CORVETTE_ROWS, trident: TRIDENT_ROWS, galleon: GALLEON_ROWS,
  shuttle: SHUTTLE_ROWS, spire: SPIRE_ROWS, leviathan: LEVIATHAN_ROWS, fan: FAN_ROWS, citadel: CITADEL_ROWS, zenith: ZENITH_ROWS,
};

const DESC: Record<string, string> = {
  dart: 'The free starter: one free cell between generator and ejector. Slow gun.',
  twin: 'Two free cells in a line, full fire rate.',
  prong: 'Two ejectors side by side and three free cells: split the signal.',
  wisp: 'One straight column of five cells. Shots fly 20% faster.',
  hornet: 'A U: two uneven arms joined at the bottom, an ejector on each.',
  lancet: 'A dog-leg that forces two turns. Fast gun, fast shots, one ejector.',
  kestrel: 'A 3-wide block with three ejectors on top. Medium size.',
  mantis: 'A hook from the bottom-left to the top-right. Quick shots.',
  bastion: 'Wide and low with four ejectors along the top. Slow, heavy to dodge.',
  halberd: 'A 2-wide spine with a crossbar and a guard. Three ejectors.',
  corvette: 'A diamond with two ejectors. Fast gun, quick shots.',
  trident: 'Three prongs joined at the base, one ejector on each.',
  galleon: 'A broad hull with five ejectors. Slow gun, big target.',
  shuttle: '11 x 11 hull with one ejector and room for a long circuit.',
  spire: 'A tall tower with side wings and six ejectors.',
  leviathan: 'A long body with uneven wings and four ejectors.',
  fan: '9 x 8 open hull with three ejectors, good for splitters.',
  citadel: 'A ring with a hole in the middle and eight ejectors. Huge.',
  zenith: 'The capstone: 80 cells and ten ejectors in a crowned shield. Huge.',
};

/** In ladder order (cheapest first). */
export const HULL_INFO: HullInfo[] = HULL_ORDER.map(id => ({ id, name: HULLS[id].name, desc: DESC[id] }));

export const HULL_BUILDERS: Record<string, () => Grid> = Object.fromEntries(
  HULL_ORDER.map(id => [id, (): Grid => withHull(id, HULL_ROWS[id])]),
);

export function cloneGrid(g: Grid): Grid {
  const out: Grid = { w: g.w, h: g.h, cells: g.cells.map(c => ({ ...c })) };
  if (g.hullId) out.hullId = g.hullId;
  return out;
}
