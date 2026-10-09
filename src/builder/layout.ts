import { CONFIG } from '../config';

/** Screen layout of the Build screen in game coordinates (portrait 540x960). */
export interface Rect { x: number; y: number; w: number; h: number }

export const VIEW_W = CONFIG.VIEW.W;
export const VIEW_H = CONFIG.VIEW.H;

export const LAYOUT = {
  top: { x: 0, y: 0, w: VIEW_W, h: 52 } as Rect,
  inspector: { x: 0, y: 52, w: VIEW_W, h: 64 } as Rect,
  gridArea: { x: 0, y: 116, w: VIEW_W, h: 704 } as Rect,
  stats: { x: 0, y: 820, w: VIEW_W, h: 34 } as Rect,
  toolbar: { x: 0, y: 854, w: VIEW_W, h: 50 } as Rect,
  tabs: { x: 0, y: 904, w: VIEW_W, h: 56 } as Rect,
  /** Bottom sheet of the picker. */
  sheet: { x: 0, y: 470, w: VIEW_W, h: VIEW_H - 470 } as Rect,
};

/** Smallest tap target we allow, in game px. */
export const MIN_TAP = 44;

/** Margin kept around the hull when fitting. */
export const FIT_MARGIN = 6;

/** Cell size in content units; the grid container is scaled by view.scale / BASE_CELL. */
export const BASE_CELL = 64;

/** Hull art metrics shared by the cell drawings and the red line (content units; a hull cell art square is BASE_CELL - 3). */
const ART_W = BASE_CELL - 3;
/** Distance from an ejector's centre to its flat base: the red line stops here. */
export const EJECTOR_BASE_DIST = ART_W * 0.4;
/** Distance from a generator's centre to the tip of its emitter notch: the red line starts here. */
export const EMITTER_TIP_DIST = ART_W * 0.4 + 4.5;

export const MIN_SCALE = 16;
export const MAX_SCALE = 160;

/** Screen position of cell (cx,cy)'s top-left corner is (ox + cx*scale, oy + cy*scale). */
export interface View { scale: number; ox: number; oy: number }

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** Scale and offset that centre the whole hull inside `area`. */
export function fitView(gw: number, gh: number, area: Rect = LAYOUT.gridArea, margin = FIT_MARGIN): View {
  const scale = Math.min((area.w - 2 * margin) / gw, (area.h - 2 * margin) / gh);
  return { scale, ox: area.x + (area.w - gw * scale) / 2, oy: area.y + (area.h - gh * scale) / 2 };
}

export function cellFromPoint(v: View, gw: number, gh: number, x: number, y: number): { x: number; y: number } | null {
  const cx = Math.floor((x - v.ox) / v.scale);
  const cy = Math.floor((y - v.oy) / v.scale);
  if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return null;
  return { x: cx, y: cy };
}

export function cellCenter(v: View, cx: number, cy: number): { x: number; y: number } {
  return { x: v.ox + (cx + 0.5) * v.scale, y: v.oy + (cy + 0.5) * v.scale };
}

/** Zooms by `factor` keeping the point (px,py) fixed on screen. */
export function zoomAt(v: View, factor: number, px: number, py: number): View {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.scale * factor));
  const k = scale / v.scale;
  return { scale, ox: px - (px - v.ox) * k, oy: py - (py - v.oy) * k };
}

/** Keeps at least `keep` px of the hull inside the area so it can never be lost off screen. */
export function clampView(v: View, gw: number, gh: number, area: Rect = LAYOUT.gridArea, keep = 60): View {
  const w = gw * v.scale;
  const h = gh * v.scale;
  const ox = Math.min(area.x + area.w - keep, Math.max(area.x + keep - w, v.ox));
  const oy = Math.min(area.y + area.h - keep, Math.max(area.y + keep - h, v.oy));
  return { scale: v.scale, ox, oy };
}

export function panBy(v: View, dx: number, dy: number): View {
  return { scale: v.scale, ox: v.ox + dx, oy: v.oy + dy };
}

/** Pans (without zooming) so that cell (cx,cy) sits fully inside `visible`, with some padding. */
export function panToReveal(v: View, cx: number, cy: number, visible: Rect, pad = 12): View {
  const left = v.ox + cx * v.scale;
  const top = v.oy + cy * v.scale;
  let dx = 0;
  let dy = 0;
  if (left < visible.x + pad) dx = visible.x + pad - left;
  else if (left + v.scale > visible.x + visible.w - pad) dx = visible.x + visible.w - pad - (left + v.scale);
  if (top < visible.y + pad) dy = visible.y + pad - top;
  else if (top + v.scale > visible.y + visible.h - pad) dy = visible.y + visible.h - pad - (top + v.scale);
  return { scale: v.scale, ox: v.ox + dx, oy: v.oy + dy };
}
