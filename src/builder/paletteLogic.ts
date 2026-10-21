import { BlockCategory } from '../engine/compilerTypes';
import { LAYOUT, Rect, VIEW_W } from './layout';
import { fmtBig } from '../ui/format';

/** Chunk 16b: the pure part of the block palette (layout math, filtering, badge and sheet text). No Pixi in here. */

export const PALETTE_COLS = 4;
export const PALETTE_GAP = 8;
/** Tile height as a fraction of its width. */
export const TILE_ASPECT = 0.9;
/** Height of the builder panel's header (close button), of the sheet buttons: 44 px at the 360 px phone width (game px x 360 / 540). */
export const CHIP_H = 66;
export const SHEET_BUTTON_H = 66;
export const PHONE_CSS_W = 360;
export const MIN_TOUCH_CSS = 44;
export const INFO_SHEET_H = 200;
/** Largest count the badge prints exactly. */
export const BADGE_MAX = 99;
export const REMOVE_TILE = '__remove';

/** Palette order: by category, then the data order within a category. */
export const PALETTE_CATEGORIES: readonly BlockCategory[] = ['pathing', 'damage', 'modifier', 'status', 'mitosis'];

export type SheetButtonId = 'place' | 'buy' | 'upgrade';

export interface TileBox { id: string; x: number; y: number; w: number; h: number }

export interface TileMetrics { cols: number; gap: number; w: number; h: number }

/** Tile size for a list `width` px wide: `cols` columns with `gap` between them and at both edges. */
export function tileMetrics(width: number, cols = PALETTE_COLS, gap = PALETTE_GAP): TileMetrics {
  const w = Math.floor((width - gap * (cols + 1)) / cols);
  return { cols, gap, w, h: Math.round(w * TILE_ASPECT) };
}

/** Places `ids` in rows (content coordinates, y from the top of the list). */
export function layoutTiles(ids: readonly string[], m: TileMetrics): { tiles: TileBox[]; contentH: number } {
  const tiles = ids.map((id, i) => ({
    id, x: m.gap + (i % m.cols) * (m.w + m.gap), y: m.gap + Math.floor(i / m.cols) * (m.h + m.gap), w: m.w, h: m.h,
  }));
  const rows = Math.ceil(ids.length / m.cols);
  return { tiles, contentH: m.gap + rows * (m.h + m.gap) };
}

export function maxScrollOf(contentH: number, viewH: number): number {
  return Math.max(0, contentH - viewH);
}

export function clampScroll(y: number, contentH: number, viewH: number): number {
  return Math.max(0, Math.min(maxScrollOf(contentH, viewH), y));
}

/** The tile under a point given in list coordinates (`cy` already includes the scroll offset). */
export function hitTile(tiles: readonly TileBox[], x: number, cy: number): TileBox | null {
  return tiles.find(t => x >= t.x && x < t.x + t.w && cy >= t.y && cy < t.y + t.h) ?? null;
}

/** Tiles that touch the window [scroll, scroll + viewH): the only ones that need to be visible. */
export function visibleTiles(tiles: readonly TileBox[], scroll: number, viewH: number): TileBox[] {
  return tiles.filter(t => t.y + t.h > scroll && t.y < scroll + viewH);
}

/** Scroll value that puts a tile fully in view with a margin, changing nothing when it already is. */
export function scrollToReveal(t: TileBox, scroll: number, viewH: number, margin = PALETTE_GAP): number {
  if (t.y - margin < scroll) return Math.max(0, t.y - margin);
  if (t.y + t.h + margin > scroll + viewH) return t.y + t.h + margin - viewH;
  return scroll;
}

/** The block ids the palette shows: one list ordered by category, then the order given (the picker order of the data file). */
export function paletteIds(blocks: readonly { id: string; category: BlockCategory }[]): string[] {
  return PALETTE_CATEGORIES.flatMap(cat => blocks.filter(b => b.category === cat).map(b => b.id));
}

/** The number on a tile: whole counts, 99+ above BADGE_MAX, never negative. */
export function badgeText(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return v > BADGE_MAX ? `${BADGE_MAX}+` : String(v);
}

/** Size in CSS px of a game-px length when the 540-wide canvas is shown `cssWidth` px wide. */
export function cssPx(gamePx: number, cssWidth = PHONE_CSS_W): number {
  return (gamePx * cssWidth) / VIEW_W;
}

// ---------------------------------------------------------------- info sheet text

export interface SheetInput {
  id: string;
  name: string;
  /** The block's rule at its current level (BlockDef.desc). */
  desc: string;
  owned: number;
  /** Owned minus placed in the active circuit. */
  available: number;
  level: number;
  maxLevel: number;
  credits: number;
  copyPrice: number;
  /** Price of the next level (ignored at max level). */
  upgradePrice: number;
  /** Frontier requirement text when the block is gated and not owned, else null. */
  lock: string | null;
  /** Builder: also say how many copies are still free to place. The Shop only says how many are owned. */
  showFree?: boolean;
}

export interface SheetButton { label: string; enabled: boolean }

export interface SheetContent {
  title: string;
  levelLine: string;
  body: string;
  ownedLine: string;
  /** Requirement text for a locked block (then buy and upgrade are null). */
  lockText: string | null;
  place: SheetButton;
  buy: SheetButton | null;
  upgrade: SheetButton | null;
}

export function sheetContent(i: SheetInput): SheetContent {
  const atMax = i.level >= i.maxLevel;
  const base = {
    title: i.name,
    levelLine: `Level ${i.level}/${i.maxLevel}`,
    body: i.desc,
    ownedLine: i.showFree ? `Owned ${i.owned} · free ${Math.max(0, i.available)}` : `Owned ${i.owned}`,
    place: { label: 'Place', enabled: i.available > 0 },
  };
  if (i.lock) return { ...base, lockText: i.lock, buy: null, upgrade: null };
  return {
    ...base,
    lockText: null,
    buy: { label: `Buy +1\n${fmtBig(i.copyPrice)}`, enabled: i.credits >= i.copyPrice },
    upgrade: atMax
      ? { label: 'Upgrade\nMAX', enabled: false }
      : { label: `Upgrade L${i.level}→L${i.level + 1}\n${fmtBig(i.upgradePrice)}`, enabled: i.credits >= i.upgradePrice },
  };
}

export function removeSheetContent(): SheetContent {
  return {
    title: 'Remove', levelLine: '', body: 'Clears this cell and returns the block to your inventory.', ownedLine: '',
    lockText: null, place: { label: 'Remove', enabled: true }, buy: null, upgrade: null,
  };
}

// ---------------------------------------------------------------- fixed geometry

export interface PaletteGeometry {
  /** The header above the list (the builder's close button); zero high when the palette has none. */
  header: Rect;
  /** The tile list while the info sheet is closed / open. */
  listClosed: Rect;
  listOpen: Rect;
  sheet: Rect;
  metrics: TileMetrics;
}

export function paletteGeometry(sheet: Rect = LAYOUT.sheet, headerH = CHIP_H): PaletteGeometry {
  const header = { x: sheet.x, y: sheet.y, w: sheet.w, h: headerH };
  const listClosed = { x: sheet.x, y: sheet.y + headerH, w: sheet.w, h: sheet.h - headerH };
  const info = { x: sheet.x, y: sheet.y + sheet.h - INFO_SHEET_H, w: sheet.w, h: INFO_SHEET_H };
  const listOpen = { ...listClosed, h: listClosed.h - INFO_SHEET_H };
  return { header, listClosed, listOpen, sheet: info, metrics: tileMetrics(sheet.w) };
}

/** The info sheet's buttons, `ids` left to right, sharing the width equally. */
export function sheetButtonRects(info: Rect, ids: readonly SheetButtonId[], pad = 8, gap = 6): Partial<Record<SheetButtonId, Rect>> {
  const y = info.y + info.h - pad - SHEET_BUTTON_H;
  const w = Math.floor((info.w - 2 * pad - (ids.length - 1) * gap) / Math.max(1, ids.length));
  const out: Partial<Record<SheetButtonId, Rect>> = {};
  ids.forEach((id, i) => { out[id] = { x: info.x + pad + i * (w + gap), y, w, h: SHEET_BUTTON_H }; });
  return out;
}
