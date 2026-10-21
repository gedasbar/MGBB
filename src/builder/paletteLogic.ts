import { BlockCategory } from '../engine/compilerTypes';
import { Rect, VIEW_W } from './layout';
import { fmtBig } from '../ui/format';

/**
 * The pure part of the block palette (layout maths, ordering, tile look, name fitting, info sheet text and geometry). No Pixi in
 * here. Chunk 16e: no tabs, one scrolling list ordered by category; tiles are the icon on a plain plate with a name under it.
 *
 * Every layout number is a multiple of 3 game px: at the 360 px phone width (540 x 2/3) that is a whole CSS pixel, so edges and
 * the thin selection outline land on the pixel grid instead of straddling it.
 */

export const PALETTE_COLS = 4;
/** Hit box of one tile (plate plus the name under it). 102 x 105 game px = 68 x 70 CSS px on a 360 px phone. */
export const TILE_W = 102;
export const TILE_H = 105;
/** The plate inside the tile (it was 85 px in the 125 px frame before 16e). */
export const PLATE = 78;
/** Space between tile hit boxes: the plates end up 48 px apart. */
export const COL_GAP = 24;
export const ROW_GAP = 18;
/** Space above the first row and below the last. */
export const MARGIN_Y = 15;
/** Gap between the plate and its name. */
export const NAME_GAP = 6;
export const PHONE_CSS_W = 360;
export const MIN_TOUCH_CSS = 44;
/** Height of the info sheet buttons: 44 px at the 360 px phone width (game px x 360 / 540). */
export const SHEET_BUTTON_H = 66;
export const SHEET_PAD = 14;
/** Largest count printed exactly on a tile. */
export const BADGE_MAX = 99;
export const REMOVE_TILE = '__remove';

/** Tile alpha: normal, owned-but-none-free (builder), and unowned / locked. */
export const ALPHA_NORMAL = 1;
export const ALPHA_USED = 0.7;
export const ALPHA_DIM = 0.35;

/** The order the single list follows (then the data file's own order inside a category). */
export const CATEGORY_ORDER: readonly Exclude<BlockCategory, 'passive'>[] = ['pathing', 'damage', 'modifier', 'status', 'mitosis'];

export type SheetButtonId = 'place' | 'buy' | 'upgrade';

export interface TileBox { id: string; x: number; y: number; w: number; h: number }

export interface TileMetrics { cols: number; colGap: number; rowGap: number; marginX: number; marginY: number; w: number; h: number; plate: number }

/** Tile sizes and margins for a list `width` px wide: the columns are centred, the gaps are fixed. */
export function tileMetrics(width: number = VIEW_W, cols = PALETTE_COLS): TileMetrics {
  const marginX = Math.max(0, Math.floor((width - cols * TILE_W - (cols - 1) * COL_GAP) / 2));
  return { cols, colGap: COL_GAP, rowGap: ROW_GAP, marginX, marginY: MARGIN_Y, w: TILE_W, h: TILE_H, plate: PLATE };
}

/** Places `ids` in rows (content coordinates, y from the top of the list). */
export function layoutTiles(ids: readonly string[], m: TileMetrics): { tiles: TileBox[]; contentH: number } {
  const tiles = ids.map((id, i) => ({
    id, x: m.marginX + (i % m.cols) * (m.w + m.colGap), y: m.marginY + Math.floor(i / m.cols) * (m.h + m.rowGap), w: m.w, h: m.h,
  }));
  const rows = Math.ceil(ids.length / m.cols);
  return { tiles, contentH: rows === 0 ? 0 : m.marginY + rows * (m.h + m.rowGap) - m.rowGap + m.marginY };
}

export function maxScrollOf(contentH: number, viewH: number): number {
  return Math.max(0, contentH - viewH);
}

export function clampScroll(y: number, contentH: number, viewH: number): number {
  return Math.max(0, Math.min(maxScrollOf(contentH, viewH), y));
}

/** The tile under a point given in list coordinates (`cy` already includes the scroll offset). The gaps between tiles hit nothing. */
export function hitTile(tiles: readonly TileBox[], x: number, cy: number): TileBox | null {
  return tiles.find(t => x >= t.x && x < t.x + t.w && cy >= t.y && cy < t.y + t.h) ?? null;
}

/** Tiles that touch the window [scroll, scroll + viewH): the only ones that need to be visible. */
export function visibleTiles(tiles: readonly TileBox[], scroll: number, viewH: number): TileBox[] {
  return tiles.filter(t => t.y + t.h > scroll && t.y < scroll + viewH);
}

/** Scroll value that puts a tile fully in view with a margin, changing nothing when it already is. */
export function scrollToReveal(t: TileBox, scroll: number, viewH: number, margin = MARGIN_Y): number {
  if (t.y - margin < scroll) return Math.max(0, t.y - margin);
  if (t.y + t.h + margin > scroll + viewH) return t.y + t.h + margin - viewH;
  return scroll;
}

/** The block ids the list shows: no passives, ordered by category (Pathing, Damage, Modifiers, Status, Mitosis), then as given. */
export function orderedBlockIds(blocks: readonly { id: string; category: BlockCategory }[]): string[] {
  const rank = (c: BlockCategory) => CATEGORY_ORDER.indexOf(c as (typeof CATEGORY_ORDER)[number]);
  return blocks
    .map((b, i) => ({ id: b.id, r: rank(b.category), i }))
    .filter(b => b.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(b => b.id);
}

/** The number on a tile: whole counts, 99+ above BADGE_MAX, never negative. */
export function badgeText(n: number): string {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return v > BADGE_MAX ? `${BADGE_MAX}+` : String(v);
}

export interface TileLook {
  alpha: number;
  /** The small plain number in the tile's corner; null for none. `faint` is the very dim "0" of an owned block with none free. */
  count: { text: string; faint: boolean } | null;
  padlock: boolean;
}

/**
 * How a tile looks. Unowned and locked blocks are dimmed (a locked one also gets a padlock) and show no count. An owned block
 * shows its count; when that is 0 (all copies placed, builder only) the number is shown very dim and the plate slightly dimmed.
 * `count` null means the tile has no number (the Remove tile).
 */
export function tileLook(o: { count: number | null; owned: boolean; locked: boolean }): TileLook {
  if (!o.owned || o.locked) return { alpha: ALPHA_DIM, count: null, padlock: o.locked };
  if (o.count === null) return { alpha: ALPHA_NORMAL, count: null, padlock: false };
  const text = badgeText(o.count);
  return { alpha: text === '0' ? ALPHA_USED : ALPHA_NORMAL, count: { text, faint: text === '0' }, padlock: false };
}

/** `text` shortened with an ellipsis so that `measure(result) <= maxW`; unchanged when it fits. */
export function fitText(text: string, maxW: number, measure: (s: string) => number): string {
  if (measure(text) <= maxW) return text;
  let n = text.length;
  while (n > 0 && measure(text.slice(0, n).trimEnd() + '…') > maxW) n--;
  return n > 0 ? text.slice(0, n).trimEnd() + '…' : '…';
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
  /** Builder: also say how many copies are still free to place and where to get a missing one. The Shop only says how many are owned. */
  showFree?: boolean;
  /** Builder preview: a warning to add to the status line (for example that the circuit then reaches no ejector). */
  note?: string | null;
}

export interface SheetButton {
  label: string;
  enabled: boolean;
  /** What to tell the player when a disabled button is pressed. */
  hint?: string;
}

export interface SheetContent {
  title: string;
  levelLine: string;
  body: string;
  /** The one status line under the description: owned / free count, how to get the block, or the lock. */
  ownedLine: string;
  /** True when the status line is a hint or warning (drawn in the warning colour). */
  warn: boolean;
  /** Requirement text for a locked block (then buy and upgrade are null). */
  lockText: string | null;
  place: SheetButton;
  buy: SheetButton | null;
  upgrade: SheetButton | null;
}

export function sheetContent(i: SheetInput): SheetContent {
  const atMax = i.level >= i.maxLevel;
  const placeable = i.available > 0 && !i.lock;
  const placeHint = i.lock ? `Locked: ${i.lock}` : i.owned <= 0 ? `Buy ${i.name} in the Shop` : `No ${i.name} left`;
  let status = i.showFree ? `Owned ${i.owned} · free ${Math.max(0, i.available)}` : `Owned ${i.owned}`;
  let warn = false;
  if (i.lock) { status = `Locked: ${i.lock}`; warn = true; }
  else if (i.showFree && i.owned <= 0) { status = 'Not owned · buy it in the Shop'; warn = true; }
  // A preview warning only matters for a block that can be placed.
  if (i.note && placeable) { status += ` · ${i.note}`; warn = true; }
  const base = {
    title: i.name,
    levelLine: `Level ${i.level}/${i.maxLevel}`,
    body: i.desc,
    ownedLine: status,
    warn,
    place: { label: 'Place', enabled: placeable, hint: placeHint },
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
    title: 'Remove', levelLine: '', body: 'Clears this cell and returns the block to your inventory.', ownedLine: '', warn: false,
    lockText: null, place: { label: 'Remove', enabled: true }, buy: null, upgrade: null,
  };
}

// ---------------------------------------------------------------- info sheet geometry

/** 'compact' (builder): one small button beside the text. 'full' (Shop): the buttons in a row under the text. */
export type SheetMode = 'compact' | 'full';

export const SHEET_TITLE_Y = 10;
export const SHEET_BODY_Y = 38;
export const SHEET_LINE_H = 17;
export const SHEET_STATUS_H = 17;
export const SHEET_COMPACT_BUTTON_W = 132;

export interface SheetGeometry {
  /** Total height of the sheet. */
  h: number;
  /** Width the description wraps at. */
  textW: number;
  /** Where the status line starts (sheet coordinates). */
  statusY: number;
  /** Button rects in sheet coordinates (x from the sheet's left edge). */
  buttons: Partial<Record<SheetButtonId, Rect>>;
}

/** Layout of the info sheet for a description of `bodyLines` lines. The sheet is as small as its text allows. */
export function sheetGeometry(width: number, mode: SheetMode, bodyLines: number, ids: readonly SheetButtonId[]): SheetGeometry {
  const statusY = SHEET_BODY_Y + Math.max(1, bodyLines) * SHEET_LINE_H + 4;
  const textBottom = statusY + SHEET_STATUS_H + 10;
  const buttons: Partial<Record<SheetButtonId, Rect>> = {};
  if (mode === 'compact') {
    const h = Math.max(textBottom, SHEET_BUTTON_H + 20);
    const bw = SHEET_COMPACT_BUTTON_W;
    ids.forEach((id, i) => { buttons[id] = { x: width - SHEET_PAD - bw - i * (bw + 6), y: Math.round((h - SHEET_BUTTON_H) / 2), w: bw, h: SHEET_BUTTON_H }; });
    return { h, textW: width - 2 * SHEET_PAD - bw - 8, statusY, buttons };
  }
  if (ids.length === 0) return { h: textBottom, textW: width - 2 * SHEET_PAD, statusY, buttons };
  const gap = 6;
  const bw = Math.floor((width - 2 * SHEET_PAD - (ids.length - 1) * gap) / Math.max(1, ids.length));
  ids.forEach((id, i) => { buttons[id] = { x: SHEET_PAD + i * (bw + gap), y: textBottom, w: bw, h: SHEET_BUTTON_H }; });
  return { h: textBottom + SHEET_BUTTON_H + 10, textW: width - 2 * SHEET_PAD, statusY, buttons };
}

/** The list viewport of a palette area: the whole area, or what is left above a sheet `sheetH` high at its bottom. */
export function listRect(area: Rect, sheetH: number): Rect {
  return { x: area.x, y: area.y, w: area.w, h: area.h - sheetH };
}
