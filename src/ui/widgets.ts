import { Graphics } from 'pixi.js';
import { UI } from './theme';

/** Chunk 29a: the shared control drawings. Pure drawing into a Graphics; hit testing stays with each screen. */
export interface WRect { x: number; y: number; w: number; h: number }

/** A modal / hub panel (the panel colour; the tiles inside stand out by their lighter fill and outline). */
export function drawModal(g: Graphics, r: WRect): Graphics {
  return g.rect(r.x, r.y, r.w, r.h).fill(UI.color.modal).stroke({ color: UI.color.border, width: UI.stroke.thick });
}

/** The one button style: a raised tile with a light outline; `selected` inverts it, `enabled` false greys the outline. */
export function drawButtonFace(g: Graphics, r: WRect, o: { selected?: boolean; enabled?: boolean; pressed?: boolean } = {}): Graphics {
  const enabled = o.enabled !== false;
  const fill = o.selected ? UI.color.selected : o.pressed ? UI.color.tilePressed : UI.color.tile;
  return g.rect(r.x, r.y, r.w, r.h).fill(fill).stroke({ color: enabled ? UI.color.text : UI.color.disabled, width: UI.stroke.thin });
}

/** A tile inside a modal (a skin, an achievement card, a ship row): raised, a thin lighter outline (`tileEdge`, chunk 29b), a thick white one when selected. */
export function drawTileFace(g: Graphics, r: WRect, o: { selected?: boolean } = {}): Graphics {
  return g.rect(r.x, r.y, r.w, r.h).fill(UI.color.tile).stroke({ color: o.selected ? UI.color.selected : UI.color.tileEdge, width: o.selected ? 3 : UI.stroke.thin });
}

/** Text colour that goes with a face drawn with `selected`. */
export const faceTextColor = (o: { selected?: boolean; enabled?: boolean } = {}): number => (o.selected ? UI.color.onSelected : o.enabled === false ? UI.color.disabled : UI.color.text);

/** The one tab style (hub tabs): the active tab is the full light cell, the others are dark raised cells; a rule under the strip separates it from the content. */
export function drawTabCell(g: Graphics, r: WRect, active: boolean): Graphics {
  g.rect(r.x, r.y, r.w, r.h).fill(active ? UI.color.selected : UI.color.tile);
  return g.rect(r.x, r.y, r.w, 1).fill(UI.color.border).rect(r.x + r.w - 1, r.y, 1, r.h).fill(UI.color.modal);
}

/** The cells of a segmented control inside `r`: equal widths, no gaps. */
export function segmentRects(r: WRect, n: number): WRect[] {
  const w = r.w / n;
  return Array.from({ length: n }, (_, i) => ({ x: r.x + i * w, y: r.y, w, h: r.h }));
}

/** The one segmented-control style: a joined row of cells, the active one inverted. */
export function drawSegmented(g: Graphics, r: WRect, active: number, n: number): Graphics {
  segmentRects(r, n).forEach((s, i) => g.rect(s.x, s.y, s.w, s.h).fill(i === active ? UI.color.selected : UI.color.tile));
  return g.rect(r.x, r.y, r.w, r.h).stroke({ color: UI.color.border, width: UI.stroke.thin });
}

/** The one toggle style: a small square with a tick when on. */
export function drawCheckbox(g: Graphics, r: WRect, checked: boolean): Graphics {
  g.rect(r.x, r.y, r.w, r.h).fill(checked ? UI.color.selected : UI.color.tile).stroke({ color: checked ? UI.color.selected : UI.color.text, width: UI.stroke.thin });
  if (checked) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, k = Math.min(r.w, r.h) / 4;
    g.moveTo(cx - k * 1.1, cy).lineTo(cx - k * 0.3, cy + k * 0.8).lineTo(cx + k * 1.2, cy - k * 0.8).stroke({ color: UI.color.onSelected, width: 3 });
  }
  return g;
}
