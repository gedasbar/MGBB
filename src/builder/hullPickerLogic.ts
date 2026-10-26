import { HULL_ORDER, HULLS, SizeClass } from '../data/hulls';
import { HULL_ROWS } from '../data/hullLayouts';
import { hullAffordable } from './paletteLogic';
import { Rect } from './layout';
import { fmtBig } from '../ui/format';
import type { BuyResult } from '../econ/progress';

/** Chunk 17a: the pure part of the hull picker (rows, info sheet text, geometry, the buy-and-select flow). No Pixi in here. */

export interface HullStatLine {
  id: string;
  name: string;
  /** Free (buildable) cells, ejectors, pulses per second, shot speed and size class, as the ladder lists them. */
  cells: number;
  ejectors: number;
  pulsesPerSec: number;
  shotSpeed: number;
  size: SizeClass;
  price: number;
}

/** Numbers of one hull: the cell and ejector counts are read off its layout, the rest from the ladder data. */
export function hullStatLine(id: string): HullStatLine {
  const flat = HULL_ROWS[id].join('');
  const h = HULLS[id as keyof typeof HULLS];
  return {
    id, name: h.name, cells: (flat.match(/_/g) ?? []).length, ejectors: (flat.match(/E/g) ?? []).length,
    pulsesPerSec: h.pulsesPerSec, shotSpeed: h.shotSpeed, size: h.size, price: h.price,
  };
}

export interface HullRow extends HullStatLine {
  owned: boolean;
  current: boolean;
  /** The yellow dot: not owned and affordable. */
  dot: boolean;
}

/** Every hull in price order (the ladder order) with what the player owns and can afford. */
export function hullRows(ownedHulls: readonly string[], currentHull: string, credits: number): HullRow[] {
  return HULL_ORDER.map(id => {
    const s = hullStatLine(id);
    const owned = ownedHulls.includes(id);
    return { ...s, owned, current: id === currentHull, dot: hullAffordable(owned, credits, s.price) };
  });
}

/** The second line of a row: "5 cells · 1 ejector · 3/s". */
export function hullSummary(s: HullStatLine): string {
  return `${s.cells} cell${s.cells === 1 ? '' : 's'} · ${s.ejectors} ejector${s.ejectors === 1 ? '' : 's'} · ${fmtBig(s.pulsesPerSec)}/s`;
}

const rate = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Lines of the info sheet of an unowned hull. */
export function hullSheetLines(s: HullStatLine): string[] {
  return [
    `Cells ${s.cells}`,
    `Ejectors ${s.ejectors}`,
    `Pulses/s ${rate(s.pulsesPerSec)}`,
    `Shot speed x${rate(s.shotSpeed)}`,
    `Size ${s.size}`,
  ];
}

export function hullBuyLabel(s: HullStatLine, credits: number): { label: string; enabled: boolean } {
  return { label: `Buy\n${fmtBig(s.price)}`, enabled: credits >= s.price };
}

// ---------------------------------------------------------------- geometry

/** The overlay: a panel with the list, and below it the info sheet while an unowned hull is selected. */
export const HULL_PANEL: Rect = { x: 16, y: 110, w: 508, h: 740 };
export const HULL_TITLE_H = 54;
const HULL_ROW_H = 76;
const HULL_ROW_GAP = 8;
const HULL_SHEET_H = 290;

export function hullListRect(sheetOpen: boolean): Rect {
  const p = HULL_PANEL;
  return { x: p.x, y: p.y + HULL_TITLE_H, w: p.w, h: p.h - HULL_TITLE_H - (sheetOpen ? HULL_SHEET_H : 0) };
}

export function hullSheetRect(): Rect {
  const p = HULL_PANEL;
  return { x: p.x, y: p.y + p.h - HULL_SHEET_H, w: p.w, h: HULL_SHEET_H };
}

/** Row rectangles in content coordinates (y from the top of the list). */
export function hullRowRects(count: number): Rect[] {
  const w = HULL_PANEL.w - 24;
  return Array.from({ length: count }, (_, i) => ({ x: 12, y: HULL_ROW_GAP + i * (HULL_ROW_H + HULL_ROW_GAP), w, h: HULL_ROW_H }));
}

export const hullContentH = (count: number) => HULL_ROW_GAP + count * (HULL_ROW_H + HULL_ROW_GAP);

/** The Buy button of the info sheet. */
export function hullBuyRect(): Rect {
  const s = hullSheetRect();
  return { x: s.x + 14, y: s.y + s.h - 14 - 66, w: s.w - 28, h: 66 };
}

// ---------------------------------------------------------------- buying

/** What the picker needs from the builder model and the progress store to buy a hull. */
export interface HullBuyDeps {
  store: { buyHull(id: string): BuyResult };
  model: { switchHull(id: string): { ok: boolean; error?: string } };
}

/** Buys the hull from the picker and selects it (switches the builder to it). Nothing is selected when the purchase fails. */
export function buyAndSelectHull(deps: HullBuyDeps, id: string): { ok: boolean; error?: string; price?: number } {
  const r = deps.store.buyHull(id);
  if (!r.ok) return { ok: false, error: r.error };
  const s = deps.model.switchHull(id);
  return s.ok ? { ok: true, price: r.price } : { ok: false, error: s.error };
}
