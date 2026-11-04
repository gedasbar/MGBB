import { CHUNK_BY_ID } from '../data/shipChunks';
import { fmtBig } from '../ui/format';
import { VIEW_W, Rect, inRect } from '../builder/layout';
import type { SheetContent } from '../builder/paletteLogic';
import { CURRENCY_CORES_NAME, DESIGN_SLOTS } from './constants';
import type { DesignStats } from './design';
import type { ShipyardEditor } from './editor';

/** Chunk 31b: the pure part of the Shipyard screen (geometry, the text of the status strip and of a chunk's info sheet). No Pixi in here. */

export const SY_HEADER_H = 52;
export const SY_DESIGN_ROW: Rect = { x: 10, y: 58, w: VIEW_W - 20, h: 44 };
/** The square that holds the 4 x 4 slots (or the cells in debug cell mode). */
export const SY_GRID_SIDE = 368;
export const SY_GRID: Rect = { x: (VIEW_W - SY_GRID_SIDE) / 2, y: 108, w: SY_GRID_SIDE, h: SY_GRID_SIDE };
export const SY_STATUS: Rect = { x: 10, y: 482, w: VIEW_W - 20, h: 48 };
export const SY_TOOLBAR: Rect = { x: 0, y: 536, w: VIEW_W, h: 48 };
/** The chunk palette and its info sheet: the bottom of the screen, over the toolbar. */
export const SY_PALETTE: Rect = { x: 0, y: SY_TOOLBAR.y, w: VIEW_W, h: 960 - SY_TOOLBAR.y };
const SLOT_PX = SY_GRID_SIDE / DESIGN_SLOTS;

export function slotRect(i: number): Rect {
  return { x: SY_GRID.x + (i % DESIGN_SLOTS) * SLOT_PX, y: SY_GRID.y + Math.floor(i / DESIGN_SLOTS) * SLOT_PX, w: SLOT_PX, h: SLOT_PX };
}

/** The grid slot (0..15) under a game point, or -1. */
export function slotAtPoint(x: number, y: number): number {
  if (!inRect(SY_GRID, x, y)) return -1;
  return Math.floor((y - SY_GRID.y) / SLOT_PX) * DESIGN_SLOTS + Math.floor((x - SY_GRID.x) / SLOT_PX);
}

/** Cell mode: the cells of a w x h layout fill the grid square (largest square cells that fit, at most CELL_PX_MAX), centred. */
const CELL_PX_MAX = 56;
export function cellMetrics(w: number, h: number): { size: number; ox: number; oy: number } {
  const size = Math.min(SY_GRID.w / w, SY_GRID.h / h, CELL_PX_MAX);
  return { size, ox: SY_GRID.x + (SY_GRID.w - w * size) / 2, oy: SY_GRID.y + (SY_GRID.h - h * size) / 2 };
}
export function cellAtPoint(w: number, h: number, x: number, y: number): { x: number; y: number } | null {
  const m = cellMetrics(w, h);
  const cx = Math.floor((x - m.ox) / m.size), cy = Math.floor((y - m.oy) / m.size);
  return cx >= 0 && cy >= 0 && cx < w && cy < h ? { x: cx, y: cy } : null;
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
