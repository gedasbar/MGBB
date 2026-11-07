import { Container, Graphics, Text } from 'pixi.js';
import { UI } from './theme';
import { coresIcon, creditIcon } from './icons';
import { makeText } from '../builder/ui';

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

/** Chunk 34b: the currency icon size that goes with a text size (one rule everywhere: 0.8 x the font size, at least 10 px). */
export const moneyIconSize = (fontSize: number): number => Math.max(10, Math.round(fontSize * 0.8));
/** Gap between the icon and its number. */
const MONEY_GAP = 5;

export interface MoneyLabel extends Container { amount: Text; setAmount(text: string): void }

/**
 * Chunk 34b: an amount of money with its icon, `prefix` (optional, same colour) + coin or Cores hexagon + number. The container's origin is the
 * anchor point: `align` says whether it is the left, centre or right end of the row; the row is centred on y = 0.
 */
export function moneyLabel(amount: string, fontSize: number, kind: 'credits' | 'cores', o: { align?: 'left' | 'center' | 'right'; color?: number; prefix?: string } = {}): MoneyLabel {
  const color = o.color ?? (kind === 'cores' ? UI.color.cores : UI.color.accent);
  const box = new Container() as MoneyLabel;
  const size = moneyIconSize(fontSize);
  const pre = o.prefix ? makeText(o.prefix, fontSize, color, { fontWeight: 'bold' }) : null;
  const icon = kind === 'cores' ? coresIcon(size) : creditIcon(size);
  const text = makeText(amount, fontSize, color, { fontWeight: 'bold' });
  pre?.anchor.set(0, 0.5);
  text.anchor.set(0, 0.5);
  box.amount = text;
  if (pre) box.addChild(pre);
  box.addChild(icon, text);
  const layout = () => {
    let x = 0;
    if (pre) { pre.position.set(0, 0); x = pre.width + MONEY_GAP; }
    icon.position.set(x, -size / 2);
    text.position.set(x + size + MONEY_GAP, 0);
    const w = text.x + text.width;
    const shift = o.align === 'right' ? -w : o.align === 'center' ? -w / 2 : 0;
    for (const c of box.children) c.x += shift;
  };
  box.setAmount = (t: string) => { text.text = t; layout(); };
  layout();
  return box;
}
