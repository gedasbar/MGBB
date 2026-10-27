import { Container, Graphics } from 'pixi.js';
import { inRect, Rect, VIEW_H, VIEW_W } from './layout';
import { makeText } from './ui';
import { THEME } from '../ui/theme';
import { fmtBig } from '../ui/format';
import { CATEGORY_COLOR } from './draw';
import { shipThumbnail, TextureMaker } from '../ui/shipArt';
import { HULL_ROWS } from '../data/hullLayouts';
import {
  hullBuyLabel, hullBuyRect, hullContentH, HULL_PANEL, HULL_TITLE_H, hullListRect, hullRowRects, hullRows, HullRow, hullSheetLines, hullSheetRect, hullSummary, hullTraitLine,
} from './hullPickerLogic';
import { clampScroll, scrollToReveal } from './paletteLogic';

/** What the picker asks of its owner (the Build screen). */
export interface HullPickerEvents {
  /** An owned hull was tapped: switch the builder to it. */
  choose(id: string): void;
  /** The Buy button was pressed (the owner buys, selects, and closes the picker on success). */
  buy(id: string): void;
  /** What the picker reads: owned hulls, the hull being built and the credits. */
  state(): { ownedHulls: readonly string[]; current: string; credits: number };
}

/** Unowned rows are dimmed; the yellow dot says which of them can be bought now. */
const UNOWNED_ALPHA = 0.55;
const DOT_R = 6;

/**
 * The hull picker (chunk 17a): an overlay with all 19 hulls in price order, scrollable. An owned hull is chosen with one tap; an
 * unowned one is dimmed with its price and opens an info sheet (stats, a small preview of its layout, Buy).
 */
export class HullPicker {
  readonly container = new Container();
  private listC = new Container();
  private maskG = new Graphics();
  private sheetC = new Container();
  private rows: HullRow[] = [];
  private scroll = 0;
  selected: string | null = null;
  isOpen = false;

  constructor(private renderer: TextureMaker, private events: HullPickerEvents) {
    this.container.visible = false;
    this.listC.mask = this.maskG;
    this.container.addChild(this.maskG, this.listC, this.sheetC);
  }

  open() {
    this.isOpen = true;
    this.selected = null;
    this.scroll = 0;
    this.container.visible = true;
    this.refresh();
    const cur = this.rows.findIndex(r => r.current);
    if (cur >= 0) this.revealRow(cur);
    this.refresh();
  }

  close() {
    this.isOpen = false;
    this.selected = null;
    this.container.visible = false;
  }

  get sheetOpen(): boolean { return this.selected !== null; }

  private get listRect(): Rect { return hullListRect(this.sheetOpen); }

  inList(x: number, y: number): boolean { return this.isOpen && inRect(this.listRect, x, y); }

  scrollBy(dy: number) {
    this.scroll = clampScroll(this.scroll + dy, hullContentH(this.rows.length), this.listRect.h);
    this.layoutList();
  }

  private revealRow(i: number) {
    const r = hullRowRects(this.rows.length)[i];
    this.scroll = scrollToReveal({ id: '', ...r }, this.scroll, this.listRect.h, 8);
  }

  /** Screen rectangle of a hull's row (null when its row is scrolled out of the list), for tests. */
  rowScreenRect(id: string): Rect | null {
    const i = this.rows.findIndex(r => r.id === id);
    if (i < 0) return null;
    const r = hullRowRects(this.rows.length)[i];
    const lr = this.listRect;
    const sr = { x: lr.x + r.x, y: lr.y + r.y - this.scroll, w: r.w, h: r.h };
    return sr.y + sr.h > lr.y && sr.y < lr.y + lr.h ? sr : null;
  }

  /** The rows as the picker draws them (test view). */
  rowsView(): (HullRow & { alpha: number })[] {
    return this.rows.map(r => ({ ...r, alpha: r.owned ? 1 : UNOWNED_ALPHA }));
  }

  buyButtonRect(): Rect | null { return this.sheetOpen ? hullBuyRect() : null; }

  /** Redraws everything from the current state (after a purchase, a selection, a scroll reset). */
  refresh() {
    if (!this.isOpen) return;
    const st = this.events.state();
    this.rows = hullRows(st.ownedHulls, st.current, st.credits);
    if (this.selected && this.rows.find(r => r.id === this.selected)?.owned) this.selected = null;
    this.scroll = clampScroll(this.scroll, hullContentH(this.rows.length), this.listRect.h);
    this.drawFrame();
    this.drawList();
    this.layoutList();
    this.drawSheet(st.credits);
  }

  private drawFrame() {
    const p = HULL_PANEL;
    for (const ch of this.container.removeChildren()) if (ch !== this.maskG && ch !== this.listC && ch !== this.sheetC) ch.destroy({ children: true });
    const dim = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: THEME.dim, alpha: 0.6 });
    const panel = new Graphics().rect(p.x, p.y, p.w, p.h).fill(THEME.panel).stroke({ color: THEME.border, width: 2 });
    const title = makeText('Choose a hull', 20, THEME.text, { fontWeight: 'bold' });
    title.position.set(p.x + 16, p.y + 14);
    this.container.addChild(dim, panel, title, this.listC, this.sheetC);
    const lr = this.listRect;
    this.maskG.clear().rect(lr.x, lr.y, lr.w, lr.h).fill(0xffffff);
    this.container.addChild(this.maskG);
  }

  private drawList() {
    for (const ch of this.listC.removeChildren()) ch.destroy({ children: true });
    const rects = hullRowRects(this.rows.length);
    this.rows.forEach((r, i) => {
      const rc = rects[i];
      const row = new Container();
      const sel = this.selected === r.id;
      const bg = new Graphics().rect(rc.x, rc.y, rc.w, rc.h).fill(THEME.buttonFill)
        .stroke({ color: r.current ? THEME.select : sel ? THEME.warn : THEME.border, width: r.current || sel ? 3 : 1.5 });
      const thumb = shipThumbnail(this.renderer, r.id, 56);
      thumb.position.set(rc.x + 36, rc.y + rc.h / 2);
      const name = makeText(r.name, 20, THEME.text, { fontWeight: 'bold' });
      name.position.set(rc.x + 76, rc.y + 10);
      const sum = makeText(hullSummary(r), 13, THEME.textDim);
      sum.position.set(rc.x + 76, rc.y + 42);
      const tag = makeText(r.current ? 'Current' : r.owned ? 'Owned' : fmtBig(r.price), 16, r.current ? THEME.good : r.owned ? THEME.textDim : THEME.currency, { fontWeight: 'bold' });
      tag.anchor.set(1, 0);
      tag.position.set(rc.x + rc.w - 14, rc.y + 12);
      const content = new Container();
      content.addChild(bg, thumb, name, sum, tag);
      if (!r.owned) content.alpha = UNOWNED_ALPHA;
      row.addChild(content);
      if (r.dot) row.addChild(new Graphics().circle(rc.x + rc.w - 14 - DOT_R, rc.y + rc.h - 16, DOT_R).fill(THEME.currency));
      this.listC.addChild(row);
    });
  }

  private layoutList() {
    // Rows are drawn in content coordinates; the list container sits at the top-left of the list, shifted by the scroll.
    const lr = this.listRect;
    this.listC.position.set(lr.x, lr.y - this.scroll);
  }

  private drawSheet(credits: number) {
    for (const ch of this.sheetC.removeChildren()) ch.destroy({ children: true });
    const row = this.rows.find(r => r.id === this.selected);
    if (!row) return;
    const s = hullSheetRect();
    const bg = new Graphics().rect(s.x, s.y, s.w, s.h).fill(THEME.panel).rect(s.x, s.y, s.w, 2).fill(THEME.border);
    const title = makeText(row.name, 22, THEME.text, { fontWeight: 'bold' });
    title.position.set(s.x + 14, s.y + 10);
    const price = makeText(fmtBig(row.price), 20, THEME.currency, { fontWeight: 'bold' });
    price.anchor.set(1, 0);
    price.position.set(s.x + s.w - 14, s.y + 12);
    const lines = makeText(hullSheetLines(row).join('\n'), 16, THEME.text, { lineHeight: 26 });
    lines.position.set(s.x + 14, s.y + 48);
    const traitText = hullTraitLine(row);
    const trait = traitText ? makeText(traitText, 15, THEME.textDim) : null;
    trait?.position.set(s.x + 14, s.y + 182);
    const preview = new Graphics();
    this.drawLayoutPreview(preview, row.id, { x: s.x + 232, y: s.y + 44, w: s.w - 232 - 14, h: 130 });
    const b = hullBuyRect();
    const buy = hullBuyLabel(row, credits);
    const btn = new Graphics().rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2).fill(THEME.buttonFill).stroke({ color: buy.enabled ? THEME.buttonLine : THEME.disabled, width: 1.5 });
    const label = makeText(buy.label, 18, buy.enabled ? THEME.text : THEME.disabled, { fontWeight: 'bold', align: 'center', lineHeight: 22 });
    label.anchor.set(0.5);
    label.position.set(b.x + b.w / 2, b.y + b.h / 2);
    this.sheetC.addChild(bg, title, price, lines, preview, btn, label);
    if (trait) this.sheetC.addChild(trait);
    if (row.dot) this.sheetC.addChild(new Graphics().circle(b.x + b.w - 14, b.y + 14, DOT_R).fill(THEME.currency));
  }

  /** A flat drawing of the hull's cells: buildable cells grey, ejectors in an accent colour, the generator in the signal red. */
  private drawLayoutPreview(g: Graphics, id: string, box: Rect) {
    const rows = HULL_ROWS[id];
    const gw = rows[0].length, gh = rows.length;
    const cs = Math.min(box.w / gw, box.h / gh, 22);
    const ox = box.x + (box.w - gw * cs) / 2, oy = box.y + (box.h - gh * cs) / 2;
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (c === '.') return;
      const color = c === 'E' ? CATEGORY_COLOR.damage : c === 'G' ? THEME.bad : THEME.cellFill;
      g.rect(ox + x * cs + 0.5, oy + y * cs + 0.5, cs - 1, cs - 1).fill(color);
    }));
  }

  // ------------------------------------------------------------------ input
  /** Handles a tap while the picker is open. Always consumes it. */
  tap(x: number, y: number) {
    const p = HULL_PANEL;
    if (!inRect(p, x, y)) { this.close(); return; }
    if (this.sheetOpen) {
      if (inRect(hullBuyRect(), x, y)) { this.events.buy(this.selected!); return; }
      if (inRect(hullSheetRect(), x, y)) return;
    }
    if (y < p.y + HULL_TITLE_H) return;
    if (!this.inList(x, y)) return;
    const lr = this.listRect;
    const rects = hullRowRects(this.rows.length);
    const i = rects.findIndex(r => inRect({ x: lr.x + r.x, y: lr.y + r.y - this.scroll, w: r.w, h: r.h }, x, y));
    if (i < 0) return;
    const r = this.rows[i];
    if (r.owned) { this.events.choose(r.id); return; }
    this.selected = this.selected === r.id ? null : r.id;
    this.scroll = clampScroll(this.scroll, hullContentH(this.rows.length), this.listRect.h);
    if (this.selected) this.revealRow(i);
    this.refresh();
  }
}
