import { Container, Graphics, Text } from 'pixi.js';
import { UI } from './theme';
import { coresIcon, creditIcon, medalIcon } from './icons';
import { amountIconSize, amountLayout, costRowLayout, AmountKind, Cost } from './amountLayout';
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

/** Chunk 34c: the one rule for an icon beside text (0.8 x the font size, at least 10 px); layout maths in `amountLayout.ts`. */
export const moneyIconSize = amountIconSize;

const kindColor = (k: AmountKind): number => (k === 'cores' ? UI.color.cores : k === 'medals' ? UI.color.medal : UI.color.accent);
const kindIcon = (k: AmountKind, size: number): Graphics => (k === 'cores' ? coresIcon(size) : k === 'medals' ? medalIcon(size) : creditIcon(size));

export interface AmountLabel extends Container { amount: Text; icon: Graphics; setAmount(text: string): void }

/**
 * Chunk 34b / 34c: an amount with its icon (coin = credits, hexagon = Cores, medal = Medals): optional `prefix` + icon + number. The
 * container's origin is the anchor point (`align`: left, centre or right end of the row); icon and number are centred on y = 0
 * (`amountLayout`, unit-tested). The number is `amount` (its `text` is what the e2e scripts read).
 */
export function amountLabel(amount: string, fontSize: number, kind: AmountKind, o: { align?: 'left' | 'center' | 'right'; color?: number; prefix?: string } = {}): AmountLabel {
  const color = o.color ?? kindColor(kind);
  const box = new Container() as AmountLabel;
  const size = amountIconSize(fontSize);
  const pre = o.prefix ? makeText(o.prefix, fontSize, color, { fontWeight: 'bold' }) : null;
  const icon = kindIcon(kind, size);
  const text = makeText(amount, fontSize, color, { fontWeight: 'bold' });
  pre?.anchor.set(0, 0.5);
  text.anchor.set(0, 0.5);
  box.amount = text; box.icon = icon;
  if (pre) box.addChild(pre);
  box.addChild(icon, text);
  const layout = () => {
    const l = amountLayout({ fontSize, textW: text.width, prefixW: pre ? pre.width : 0, align: o.align });
    if (pre) pre.position.set(l.prefixX, l.textCentreY);
    icon.position.set(l.iconX, l.iconTop);
    text.position.set(l.textX, l.textCentreY);
  };
  box.setAmount = (t: string) => { text.text = t; layout(); };
  layout();
  return box;
}

/**
 * Chunk 34c: a price of one or two currencies ("1.2K", or "50K + 15 medals" for a legendary block) as amounts with a "+" between them,
 * the row centred on the origin. `setCosts` redraws; `dim` greys it (a button that cannot be pressed).
 */
export interface CostLabel extends Container { setCosts(costs: readonly Cost[], dim?: boolean): void }
export function costLabel(costs: readonly Cost[], fontSize: number, o: { color?: number } = {}): CostLabel {
  const box = new Container() as CostLabel;
  box.setCosts = (list, dim = false) => {
    for (const c of box.removeChildren()) c.destroy({ children: true });
    const parts = list.map(c => amountLabel(c.text, fontSize, c.kind, { align: 'left', color: o.color && c.kind === 'credits' ? o.color : undefined }));
    const plus = list.length > 1 ? makeText('+', fontSize, UI.color.text, { fontWeight: 'bold' }) : null;
    const row = costRowLayout(parts.map(p => amountLayout({ fontSize, textW: p.amount.width }).width), plus ? plus.width : 0);
    parts.forEach((p, i) => { p.position.set(row.xs[i], 0); box.addChild(p); });
    row.plusXs.forEach(x => { const t = makeText('+', fontSize, UI.color.text, { fontWeight: 'bold' }); t.anchor.set(0, 0.5); t.position.set(x, 0); box.addChild(t); });
    plus?.destroy();
    box.alpha = dim ? 0.45 : 1;
  };
  box.setCosts(costs);
  return box;
}

/**
 * Chunk 34c: the label of a button that may carry a price. Without costs it is the plain text, centred; with costs the label's first line
 * sits over the price drawn as amounts (coin / hexagon / medal + number). The origin is the button's centre. The full `label` text stays in
 * each screen's debug state; this only draws it.
 */
export interface ButtonLabel extends Container { set(label: string, costs: readonly Cost[] | undefined, enabled: boolean): void }
export function buttonLabel(fontSize: number, lineHeight = Math.round(fontSize * 1.3)): ButtonLabel {
  const box = new Container() as ButtonLabel;
  const title = makeText('', fontSize, UI.color.text, { fontWeight: 'bold', align: 'center', lineHeight });
  title.anchor.set(0.5);
  const cost = costLabel([], fontSize);
  box.addChild(title, cost);
  box.set = (label, costs, enabled) => {
    title.style.fill = enabled ? UI.color.text : UI.color.disabled;
    if (costs && costs.length > 0) {
      title.text = label.split('\n')[0];
      title.y = -lineHeight / 2;
      cost.setCosts(costs, !enabled);
      cost.y = lineHeight / 2;
      cost.visible = true;
    } else {
      title.text = label; title.y = 0; cost.visible = false;
    }
  };
  return box;
}
