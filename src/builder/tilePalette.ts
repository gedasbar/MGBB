import { Container, Graphics, Text } from 'pixi.js';
import { BLOCKS } from '../data/blocks';
import { CATEGORY_COLOR, drawX } from './draw';
import { drawPlate } from '../ui/blockArt';
import { inRect, Rect } from './layout';
import { makeText } from './ui';
import { THEME } from '../ui/theme';
import {
  badgeText, chipLayout, clampScroll, hitTile, INFO_SHEET_H, layoutTiles, loadTab, maxScrollOf, paletteGeometry,
  PALETTE_TABS, PaletteTab, REMOVE_TILE, saveTab, scrollToReveal, SheetButtonId, SheetContent, sheetButtonRects,
  TAB_LABEL, TileBox, visibleTiles,
} from './paletteLogic';

export { REMOVE_TILE };
export type { SheetButtonId };

/** What a palette shows: the builder and the Shop each supply their own (ids per tab, counts, locks, sheet text). */
export interface PaletteSource {
  /** Every tile of a tab in order, special tiles (Remove) included. */
  ids(tab: PaletteTab): string[];
  /** The number on the tile, or null for no badge. */
  badge(id: string): number | null;
  /** Requirement text when the block is gated, else null. */
  lock(id: string): string | null;
  /** The tile is the block already on the selected cell (builder only). */
  current(id: string): boolean;
  content(id: string): SheetContent;
}

export interface PaletteOptions {
  /** The whole region: tab row, list and the info sheet at the bottom. */
  area: Rect;
  /** Buttons of the info sheet, left to right. */
  buttons: SheetButtonId[];
  /** What a second tap on the selected tile does: close the sheet (Shop) or press its place button (builder). */
  tapAgain: 'close' | 'place';
  /** The builder's bottom sheet draws its own panel and an X; the Shop sits on its own background. */
  panel: boolean;
}

export interface PaletteEvents {
  /** A tile that was not selected has been tapped: the caller shows what it needs (preview, inspector text). */
  onSelect(id: string): void;
  onButton(id: string, button: SheetButtonId): void;
  onClose(): void;
  onMessage(msg: string): void;
}

type Tile = TileBox;

/** One reusable tile: created the first time a block is shown, then only moved, hidden and restyled. */
interface TileView {
  c: Container;
  bg: Graphics;
  plate: Graphics;
  badge: Text;
  badgeBg: Graphics;
  lock: Graphics;
  /** What the face was last drawn for; the face is redrawn only when this changes. */
  key: string;
}

interface SheetButtonView { c: Container; bg: Graphics; label: Text; rect: Rect }

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The last tab used, shared by the builder and the Shop (a player thinks of "the Damage tab", not of one screen's). */
let rememberedTab: PaletteTab | null = null;

const BADGE_W = 34;
const BADGE_H = 22;
const ALL_BUTTONS: SheetButtonId[] = ['place', 'upgrade', 'buy'];

/**
 * The block palette shared by the Shop and the builder: tab chips, a scrolling grid of plate tiles with count badges, and an
 * info sheet for the selected tile. Chunk 16b-fix: one component, two sources.
 */
export class TilePalette {
  readonly container = new Container();
  readonly geo;
  /** The whole region (tabs, list, info sheet). */
  readonly sheet: Rect;
  readonly closeRect: Rect;
  /** The tile list; its height shrinks while the info sheet is open. */
  readonly listRect: Rect;
  scrollY = 0;
  selected: string | null = null;
  tiles: Tile[] = [];
  tab: PaletteTab;
  sheetOpen = false;
  protected source: PaletteSource | null = null;
  protected events: PaletteEvents | null = null;
  private contentH = 0;
  private listC = new Container();
  private bg = new Graphics();
  private maskG = new Graphics();
  private views = new Map<string, TileView>();
  private chipRects: Record<PaletteTab, Rect>;
  private chipG = new Graphics();
  private chipLabels: Record<string, Text> = {};
  private infoC = new Container();
  private infoBg = new Graphics();
  private infoTitle = makeText('', 18, THEME.text, { fontWeight: 'bold' });
  private infoLevel = makeText('', 13, THEME.textDim, { fontWeight: 'bold' });
  private infoBody = makeText('', 12, THEME.text, { wordWrap: true, wordWrapWidth: 520, lineHeight: 15 });
  private infoOwned = makeText('', 13, THEME.textDim, { fontWeight: 'bold' });
  private infoButtons: Record<SheetButtonId, SheetButtonView>;
  private content: SheetContent | null = null;
  private buttonIds: SheetButtonId[];

  constructor(protected opts: PaletteOptions) {
    const g = this.geo = paletteGeometry(opts.area);
    this.buttonIds = opts.buttons;
    this.sheet = { ...opts.area };
    this.listRect = { ...g.listClosed };
    const strip = chipLayout(opts.area.w, opts.area.y, PALETTE_TABS.length, opts.panel ? undefined : 0);
    this.closeRect = strip.close;
    this.chipRects = Object.fromEntries(PALETTE_TABS.map((t, i) => [t, strip.chips[i]])) as Record<PaletteTab, Rect>;
    this.tab = rememberedTab ?? loadTab(safeStorage());
    rememberedTab = this.tab;

    const s = this.sheet;
    if (opts.panel) {
      this.bg.rect(s.x, s.y, s.w, s.h + 20).fill(THEME.panel).stroke({ color: THEME.border, width: 2 });
      this.bg.rect(s.x, s.y + g.chipRow.h - 1, s.w, 1).fill(THEME.border);
      drawX(this.bg, this.closeRect.x + this.closeRect.w / 2, this.closeRect.y + this.closeRect.h / 2, 9, THEME.buttonIcon, 3);
    }
    this.container.addChild(this.bg, this.chipG);
    for (const t of PALETTE_TABS) {
      const r = this.chipRects[t];
      const label = makeText(TAB_LABEL[t], 12, THEME.text, { fontWeight: 'bold' });
      label.anchor.set(0.5);
      label.position.set(r.x + r.w / 2, r.y + r.h / 2);
      this.chipLabels[t] = label;
      this.container.addChild(label);
    }
    this.listC.mask = this.maskG;
    this.container.addChild(this.maskG, this.listC);

    this.infoButtons = { place: this.makeSheetButton(), buy: this.makeSheetButton(), upgrade: this.makeSheetButton() };
    this.infoTitle.position.set(14, 8);
    this.infoLevel.anchor.set(1, 0);
    this.infoLevel.position.set(s.w - 14, 11);
    this.infoBody.position.set(14, 36);
    this.infoOwned.position.set(14, INFO_SHEET_H - 8 - 66 - 6 - 18);
    this.infoC.addChild(this.infoBg, this.infoTitle, this.infoLevel, this.infoBody, this.infoOwned);
    for (const b of Object.values(this.infoButtons)) this.infoC.addChild(b.c);
    this.infoC.position.set(g.sheet.x, g.sheet.y);
    this.infoC.visible = false;
    this.container.addChild(this.infoC);

    this.drawChips();
    this.layoutSheetButtons();
  }

  /** Connects the palette to its data and shows it. The selection and the sheet are reset. */
  attach(source: PaletteSource, events: PaletteEvents) {
    this.source = source;
    this.events = events;
    this.selected = null;
    this.sheetOpen = false;
    this.scrollY = 0;
    this.container.visible = true;
    this.build();
  }

  get isOpen(): boolean { return this.container.visible; }

  get maxScrollValue(): number { return maxScrollOf(this.contentH, this.listRect.h); }

  /** The badge text a tile currently shows (null when it has none or was never drawn), for tests. */
  badgeOf(id: string): string | null {
    const v = this.views.get(id);
    return v && v.badge.visible ? v.badge.text : null;
  }

  chipRect(tab: PaletteTab): Rect { return this.chipRects[tab]; }

  sheetButtonRect(id: SheetButtonId): Rect { return this.infoButtons[id].rect; }

  /** Whether a sheet button is on screen (a locked block has no buy / upgrade). */
  sheetButtonVisible(id: SheetButtonId): boolean { return this.sheetOpen && this.infoButtons[id].c.visible; }

  get sheetContentNow(): SheetContent | null { return this.sheetOpen ? this.content : null; }

  hide() {
    this.container.visible = false;
    this.selected = null;
    this.sheetOpen = false;
    this.infoC.visible = false;
  }

  contains(x: number, y: number): boolean {
    return this.isOpen && (inRect(this.sheet, x, y) || (this.sheetOpen && inRect(this.geo.sheet, x, y)));
  }

  inList(x: number, y: number): boolean {
    return this.isOpen && inRect(this.listRect, x, y);
  }

  // ------------------------------------------------------------------ tabs
  setTab(tab: PaletteTab) {
    this.tab = tab;
    rememberedTab = tab;
    saveTab(safeStorage(), tab);
    this.sheetOpen = false;
    this.scrollY = 0;
    this.build();
  }

  closeSheet() {
    if (!this.sheetOpen) return;
    this.sheetOpen = false;
    this.build();
  }

  // ------------------------------------------------------------------ building
  /** Re-lays-out the list for the current tab, sheet state and counts. Display objects are reused. */
  build() {
    if (!this.source) return;
    const lr = this.sheetOpen ? this.geo.listOpen : this.geo.listClosed;
    Object.assign(this.listRect, lr);
    this.maskG.clear().rect(lr.x, lr.y, lr.w, lr.h).fill(0xffffff);
    const laid = layoutTiles(this.source.ids(this.tab), this.geo.metrics);
    this.tiles = laid.tiles;
    this.contentH = laid.contentH;
    this.scrollY = clampScroll(this.scrollY, this.contentH, this.listRect.h);
    const shown = new Set(this.tiles.map(t => t.id));
    for (const [id, v] of this.views) if (!shown.has(id)) v.c.visible = false;
    for (const t of this.tiles) this.styleTile(t, this.viewOf(t.id));
    this.drawChips();
    this.updateSheet();
    this.applyScroll();
  }

  private viewOf(id: string): TileView {
    let v = this.views.get(id);
    if (v) return v;
    const c = new Container();
    const bg = new Graphics();
    const plate = new Graphics();
    const badgeBg = new Graphics();
    const badge = makeText('0', 13, THEME.text, { fontWeight: 'bold' });
    badge.anchor.set(0.5);
    const lock = new Graphics();
    if (id === REMOVE_TILE) drawX(plate, 0, 0, 14, THEME.bad, 5);
    else drawPlate(plate, id, this.geo.metrics.w - 4, 0);
    c.addChild(bg, plate, badgeBg, badge, lock);
    this.listC.addChild(c);
    v = { c, bg, plate, badge, badgeBg, lock, key: '' };
    this.views.set(id, v);
    return v;
  }

  private styleTile(t: Tile, v: TileView) {
    const src = this.source!;
    const isRemove = t.id === REMOVE_TILE;
    const count = src.badge(t.id);
    const lock = isRemove ? null : src.lock(t.id);
    const usable = count === null || count > 0;
    const sel = this.selected === t.id;
    const cur = src.current(t.id);
    const text = count === null ? '' : badgeText(count);
    const key = `${t.w}x${t.h}|${sel ? 1 : 0}|${cur ? 1 : 0}|${usable ? 1 : 0}|${lock ? 1 : 0}|${text}`;
    v.c.position.set(t.x, t.y);
    v.c.visible = true;
    if (v.key === key) return;
    v.key = key;
    const color = isRemove ? THEME.bad : CATEGORY_COLOR[BLOCKS[t.id].category];
    const a = usable ? 1 : 0.4;
    v.bg.clear()
      .rect(0, 0, t.w, t.h).fill({ color: THEME.buttonFill, alpha: usable ? 1 : 0.55 })
      .rect(0, 0, t.w, t.h).stroke({ color: sel ? THEME.select : cur ? THEME.warn : color, width: sel ? 3 : 2, alpha: sel || cur ? 1 : a });
    v.plate.position.set(t.w / 2, t.h / 2);
    v.plate.alpha = a;
    v.badgeBg.clear();
    v.badge.visible = count !== null;
    if (count !== null) {
      v.badge.text = text;
      v.badge.style.fill = usable ? THEME.text : THEME.bad;
      const bw = Math.max(BADGE_W, v.badge.width + 12);
      v.badgeBg.rect(t.w - bw - 4, 4, bw, BADGE_H).fill({ color: THEME.hullDark, alpha: 0.85 });
      v.badge.position.set(t.w - 4 - bw / 2, 4 + BADGE_H / 2);
    }
    v.lock.clear();
    if (lock) {
      // A padlock: a dark plate behind a light body with an arched shackle.
      v.lock.rect(4, 4, 26, 26).fill({ color: THEME.hullDark, alpha: 0.85 });
      v.lock.rect(10, 16, 14, 10).fill(THEME.warn);
      v.lock.moveTo(13, 16).lineTo(13, 12).arc(17, 12, 4, Math.PI, 0).lineTo(21, 16).stroke({ color: THEME.warn, width: 2.5 });
    }
  }

  private drawChips() {
    const g = this.chipG.clear();
    for (const t of PALETTE_TABS) {
      const r = this.chipRects[t];
      const col = t === 'all' ? THEME.buttonLine : CATEGORY_COLOR[t];
      const on = t === this.tab;
      g.rect(r.x, r.y + 4, r.w, r.h - 8).fill(on ? col : THEME.buttonFill);
      g.rect(r.x, r.y + 4, r.w, r.h - 8).stroke({ color: col, width: on ? 3 : 1.5 });
      this.chipLabels[t].style.fill = on ? THEME.pressedIcon : col;
    }
  }

  // ------------------------------------------------------------------ info sheet
  private makeSheetButton(): SheetButtonView {
    const c = new Container();
    const bg = new Graphics();
    const label = makeText('', 13, THEME.text, { fontWeight: 'bold', align: 'center', lineHeight: 17 });
    label.anchor.set(0.5);
    c.addChild(bg, label);
    return { c, bg, label, rect: { x: 0, y: 0, w: 0, h: 0 } };
  }

  private layoutSheetButtons() {
    const r = sheetButtonRects(this.geo.sheet, this.buttonIds);
    for (const id of ALL_BUTTONS) {
      const v = this.infoButtons[id];
      const b = r[id];
      v.rect = b ?? { x: -999, y: -999, w: 0, h: 0 };
      if (!b) continue;
      v.c.position.set(b.x - this.geo.sheet.x, b.y - this.geo.sheet.y);
      v.label.position.set(b.w / 2, b.h / 2);
    }
    this.infoBg.clear().rect(0, 0, this.geo.sheet.w, INFO_SHEET_H).fill(THEME.panel).rect(0, 0, this.geo.sheet.w, 2).fill(THEME.border);
  }

  private updateSheet() {
    this.infoC.visible = this.sheetOpen && !!this.selected;
    if (!this.infoC.visible) { this.content = null; return; }
    const c = this.source!.content(this.selected!);
    this.content = c;
    this.infoTitle.text = c.title;
    this.infoLevel.text = c.levelLine;
    this.infoBody.text = c.body;
    this.infoOwned.text = c.lockText ? `Locked: ${c.lockText}` : c.ownedLine;
    this.infoOwned.style.fill = c.lockText ? THEME.warn : THEME.textDim;
    const specs: Record<SheetButtonId, { label: string; enabled: boolean } | null> = { place: c.place, buy: c.buy, upgrade: c.upgrade };
    for (const id of ALL_BUTTONS) {
      const v = this.infoButtons[id];
      const spec = this.buttonIds.includes(id) ? specs[id] : null;
      v.c.visible = !!spec;
      if (!spec) continue;
      v.label.text = spec.label;
      v.label.style.fill = spec.enabled ? THEME.text : THEME.disabled;
      v.bg.clear().rect(1, 1, v.rect.w - 2, v.rect.h - 2).fill(THEME.buttonFill).stroke({ color: spec.enabled ? THEME.buttonLine : THEME.disabled, width: 1.5 });
    }
  }

  /** Redraws counts, prices and the sheet after a purchase. */
  refresh() {
    if (this.isOpen) this.build();
  }

  // ------------------------------------------------------------------ scrolling
  private applyScroll() {
    this.scrollY = clampScroll(this.scrollY, this.contentH, this.listRect.h);
    this.listC.position.set(0, this.listRect.y - this.scrollY);
    const inView = new Set(visibleTiles(this.tiles, this.scrollY, this.listRect.h).map(t => t.id));
    for (const t of this.tiles) this.views.get(t.id)!.c.visible = inView.has(t.id);
  }

  scrollBy(dy: number) {
    this.scrollY += dy;
    this.applyScroll();
  }

  wheel(deltaY: number) {
    this.scrollBy(deltaY);
  }

  tileAt(x: number, y: number): Tile | null {
    if (!this.inList(x, y)) return null;
    return hitTile(this.tiles, x, y - this.listRect.y + this.scrollY);
  }

  /** Screen position of a tile, for tests. */
  tileScreenRect(id: string): Rect | null {
    const t = this.tiles.find(tt => tt.id === id);
    if (!t) return null;
    return { x: t.x, y: this.listRect.y + t.y - this.scrollY, w: t.w, h: t.h };
  }

  /** Scrolls so a tile is fully visible. */
  reveal(id: string) {
    const t = this.tiles.find(tt => tt.id === id);
    if (!t) return;
    this.scrollY = scrollToReveal(t, this.scrollY, this.listRect.h);
    this.applyScroll();
  }

  /** Selects a tile, opens its info sheet and keeps it in view. */
  select(id: string) {
    this.selected = id;
    this.sheetOpen = true;
    this.build();
    this.reveal(id);
  }

  // ------------------------------------------------------------------ input
  /**
   * A tap in the palette. Returns true when the tap was inside it (consumed).
   * A tile tap selects it and opens the info sheet; a second tap on it closes the sheet (Shop) or presses Place (builder).
   */
  tap(x: number, y: number): boolean {
    if (!this.contains(x, y)) return false;
    if (this.opts.panel && inRect(this.closeRect, x, y)) { this.events!.onClose(); return true; }
    for (const t of PALETTE_TABS) {
      if (inRect(this.chipRects[t], x, y)) { if (t !== this.tab) this.setTab(t); else this.closeSheet(); return true; }
    }
    if (this.sheetOpen && inRect(this.geo.sheet, x, y)) { this.tapSheet(x, y); return true; }
    const t = this.tileAt(x, y);
    if (!t) return true;
    if (this.sheetOpen && this.selected === t.id) {
      if (this.opts.tapAgain === 'close') this.closeSheet();
      else this.press('place');
      return true;
    }
    this.select(t.id);
    this.events!.onSelect(t.id);
    return true;
  }

  private tapSheet(x: number, y: number) {
    const hit = ALL_BUTTONS.find(b => this.infoButtons[b].c.visible && inRect(this.infoButtons[b].rect, x, y));
    if (hit) this.press(hit);
  }

  /** Presses a sheet button. A disabled Place says why instead of acting. */
  press(button: SheetButtonId) {
    const id = this.selected;
    const c = this.content;
    if (!id || !c) return;
    if (button === 'place' && !c.place.enabled) { this.events!.onMessage(`No ${c.title} left`); return; }
    this.events!.onButton(id, button);
  }
}
