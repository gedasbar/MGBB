import { CHUNK_BY_ID } from '../data/shipChunks';
import { fmtBig } from '../ui/format';
import { VIEW_W, Rect, LAYOUT, View, cellFromPoint, fitView } from '../builder/layout';
import type { SheetContent } from '../builder/paletteLogic';
import { CHUNK_CELLS, CURRENCY_CORES_NAME, DESIGN_SLOTS, GENERATOR_COLUMN } from './constants';
import { NO_CELL_ABOVE_GENERATOR, type DesignStats } from './design';
import type { ShipyardEditor } from './editor';

/** Chunk 31b: the pure part of the Shipyard screen (geometry, the text of the status strip and of a chunk's info sheet). No Pixi in here. */

export const SY_HEADER_H = 52;
export const SY_DESIGN_ROW: Rect = { x: 10, y: 58, w: VIEW_W - 20, h: 44 };
/**
 * Chunk 31c: the grid is the circuit builder's own grid drawing (GridRenderer, which clips to the builder's grid area from y 116), fitted into one of two areas: the big one
 * while nothing is being picked, a smaller one above the palette sheet while it is open (like the builder panning the circuit clear of its sheet).
 */
export const SY_GRID_AREA: Rect = { x: 0, y: LAYOUT.gridArea.y, w: VIEW_W, h: 600 };
export const SY_GRID_AREA_OPEN: Rect = { x: 0, y: LAYOUT.gridArea.y, w: VIEW_W, h: 396 };
/** The build area is 12 x 12 cells; the generator is the 13th row (a fixed cell under it). */
export const SY_COLS = DESIGN_SLOTS * CHUNK_CELLS;
export const SY_ROWS = SY_COLS + 1;
/** The bottom, from the top: the error line, the stats strip, the builder-style toolbar and the big Use button (all under the palette sheet when it is open). */
export const SY_ERROR: Rect = { x: 10, y: 722, w: VIEW_W - 20, h: 36 };
export const SY_STATS: Rect = { x: 0, y: 760, w: VIEW_W, h: 34 };
export const SY_TOOLBAR: Rect = { x: 0, y: 798, w: VIEW_W, h: 50 };
export const SY_USE: Rect = { x: 10, y: 858, w: VIEW_W - 20, h: 56 };
/** The chunk palette and its info sheet: the bottom of the screen, over the strip and the toolbar. */
export const SY_PALETTE: Rect = { x: 0, y: 520, w: VIEW_W, h: 960 - 520 };

export const gridView = (open = false): View => fitView(SY_COLS, SY_ROWS, open ? SY_GRID_AREA_OPEN : SY_GRID_AREA);

/** The screen rectangle of a chunk slot (0..15, row-major): a 3 x 3 block of the builder's cells. */
export function slotRect(i: number, open = false): Rect {
  const v = gridView(open), n = CHUNK_CELLS * v.scale;
  return { x: v.ox + (i % DESIGN_SLOTS) * n, y: v.oy + Math.floor(i / DESIGN_SLOTS) * n, w: n, h: n };
}
/** The screen rectangle of the fixed generator cell (under the bottom row, GENERATOR_COLUMN). */
export function generatorRect(open = false): Rect {
  const v = gridView(open);
  return { x: v.ox + GENERATOR_COLUMN * v.scale, y: v.oy + SY_COLS * v.scale, w: v.scale, h: v.scale };
}

/** The grid slot (0..15) under a game point, or -1 (the generator row and everything outside the 12 x 12 build area is -1). */
export function slotAtPoint(x: number, y: number, open = false): number {
  const v = gridView(open);
  const c = cellFromPoint(v, SY_COLS, SY_COLS, x, y);
  return c ? Math.floor(c.y / CHUNK_CELLS) * DESIGN_SLOTS + Math.floor(c.x / CHUNK_CELLS) : -1;
}

/** Cell mode: the cells of a w x h layout are fitted into the grid area like the builder fits a hull. */
export function cellMetrics(w: number, h: number, open = false): { size: number; ox: number; oy: number } {
  const v = fitView(w, h, open ? SY_GRID_AREA_OPEN : SY_GRID_AREA);
  return { size: v.scale, ox: v.ox, oy: v.oy };
}
export function cellAtPoint(w: number, h: number, x: number, y: number, open = false): { x: number; y: number } | null {
  return cellFromPoint(fitView(w, h, open ? SY_GRID_AREA_OPEN : SY_GRID_AREA), w, h, x, y);
}

/** The three design buttons at the left of the design row and the name box beside them. */
export function designTabRects(n: number): Rect[] {
  const r = SY_DESIGN_ROW, w = 52;
  return Array.from({ length: n }, (_, i) => ({ x: r.x + i * w, y: r.y, w, h: r.h }));
}
export function nameBoxRect(n: number): Rect {
  const r = SY_DESIGN_ROW, left = n * 52 + 8;
  return { x: r.x + left, y: r.y, w: r.w - left, h: r.h };
}

// ---------------------------------------------------------------- texts

const rate = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "24 cells · 2 ejectors · 4.1/s · shots x1.2 · medium", the live strip under the grid. */
export function statsText(st: DesignStats | null): string {
  if (!st) return 'Stats appear when the ship is valid';
  return `${st.cells} cells · ${st.ejectors} ejector${st.ejectors === 1 ? '' : 's'} · ${rate(st.pulsesPerSec)}/s · shots x${rate(st.shotSpeed)} · ${st.size}`;
}

/** The first line of the strip: VALID, or the first plain-language problem (a mistake in the design, then what it needs to own). */
export function statusText(problems: readonly string[], canUse: boolean, open: boolean): { text: string; valid: boolean } {
  if (!open) return { text: 'The Shipyard is not open yet', valid: false };
  if (problems.length > 0) return { text: problems[0], valid: false };
  return { text: canUse ? 'VALID' : 'Not ready', valid: canUse };
}

/** Slots (0..15) a list of design problems name ("... at row 2, column 3 ..."), to outline them. */
export function problemSlots(problems: readonly string[]): number[] {
  const out = new Set<number>();
  for (const p of problems) {
    // The missing cell above the generator is outlined on the slot it would belong to (bottom row, the column the generator sits in).
    if (p === NO_CELL_ABOVE_GENERATOR) out.add((DESIGN_SLOTS - 1) * DESIGN_SLOTS + Math.floor(GENERATOR_COLUMN / CHUNK_CELLS));
    const m = /row (\d+), column (\d+)/.exec(p);
    if (m) out.add((Number(m[1]) - 1) * DESIGN_SLOTS + Number(m[2]) - 1);
  }
  return [...out].filter(i => i >= 0 && i < DESIGN_SLOTS * DESIGN_SLOTS);
}

/** The info sheet of a chunk tile: its text, the copies owned and free, Place (a free copy needed) and Buy (Cores). */
export function chunkSheet(ed: ShipyardEditor, id: string): SheetContent {
  const c = CHUNK_BY_ID[id];
  const free = ed.free(id);
  const price = ed.price(id);
  return {
    title: c.name,
    levelLine: '',
    body: c.text,
    stack: '',
    ownedLine: `Owned ${ed.owned(id)} · free ${free}`,
    lockText: null,
    place: { label: 'Place', enabled: free > 0 },
    buy: { label: `Buy +1\n${fmtBig(price)} ${CURRENCY_CORES_NAME}`, enabled: ed.canAfford(id) },
    upgrade: null,
  };
}

/** The sheet of the Remove tile (an occupied slot is selected). */
export function removeChunkSheet(name: string): SheetContent {
  return { title: 'Remove', levelLine: '', body: `Takes ${name} out of this slot; its copy is free again.`, stack: '', ownedLine: '', lockText: null, place: { label: 'Remove', enabled: true }, buy: null, upgrade: null };
}
