import { CanvasTextMetrics, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { BLOCKS } from '../data/blocks';
import { drawX } from './draw';
import { drawTileIcon } from '../ui/blockArt';
import { inRect, Rect } from './layout';
import { makeText } from './ui';
import { THEME } from '../ui/theme';
import {
  clampScroll, COL_GAP, fitText, hitTile, layoutTiles, listRect, maxScrollOf, NAME_GAP, REMOVE_TILE, scrollToReveal, SheetButtonId,
  SheetContent, sheetGeometry, SheetGeometry, SheetMode, SHEET_BODY_Y, SHEET_LINE_H, SHEET_PAD, SHEET_TITLE_Y, tileLook, TileBox, tileMetrics,
  visibleTiles,
} from './paletteLogic';

export { REMOVE_TILE };
export type { SheetButtonId };

/** What a palette shows: the builder and the Shop each supply their own (ids, counts, locks, sheet text). */
export interface PaletteSource {
  /** Every tile in order, special tiles (Remove) included. */
  ids(): string[];
  /** The number on the tile, or null for none. */
  count(id: string): number | null;
  /** The player owns at least one copy (unowned tiles are dimmed). */
  owned(id: string): boolean;
  /** Requirement text when the block is gated, else null. */
  lock(id: string): string | null;
  content(id: string): SheetContent;
}

export interface PaletteOptions {
  /** The whole region: the tile list and, at its bottom, the info sheet. */
  area: Rect;
  /** Buttons of the info sheet, left to right (builder: Place; Shop: Upgrade, Buy). */
  buttons: SheetButtonId[];
  /** What a second tap on the selected tile does: close the sheet (Shop) or press its place button (builder). */
  tapAgain: 'close' | 'place';
  /** The builder's bottom sheet draws its own panel; the Shop sits on its own background. */
  panel: boolean;
}

export interface PaletteEvents {
  /** A tile that was not selected has been tapped: the caller shows what it needs (a preview on the circuit). */
  onSelect(id: string): void;
  onButton(id: string, button: SheetButtonId): void;
  onMessage(msg: string): void;
}

type Tile = TileBox;

const NAME_SIZE = 16;
const COUNT_SIZE = 18;
const FRAME_GAP = 3;
const FRAME_W = 3;
const BORDER_W = 2;
const ALL_BUTTONS: SheetButtonId[] = ['place', 'upgrade', 'buy'];
const GREY = 0xa0a0a6;

/** One reusable tile: created the first time a block is shown, then only moved, hidden and restyled. */
interface TileView {
  c: Container;
  /** Everything that dims together (plate, name, count, padlock). */
  body: Container;
  name: Text;
  count: Text;
  lock: Graphics;
  frame: Graphics;
  /** What the look was last drawn for; it is redrawn only when this changes. */
  key: string;
  /** Count text currently shown, for tests. */
  countText: string | null;
}

interface SheetButtonView { c: Container; bg: Graphics; label: Text; rect: Rect }

function nameOf(id: string): string {
  return id === REMOVE_TILE ? 'Remove' : BLOCKS[id].name;
}

/**
 * The block palette shared by the Shop and the builder (chunk 16e): one scrolling list of plain tiles (icon on a plate, the name
 * under it, a small count in the corner) and a compact info sheet for the selected tile. No tabs.
 */
export class TilePalette {
  readonly container = new Container();
  readonly metrics = tileMetrics();
  /** The whole region (list and sheet). */
  readonly sheet: Rect;
  /** The tile list; its height shrinks while the info sheet is open. */
  readonly listRect: Rect;
  scrollY = 0;
  selected: string | null = null;
  tiles: Tile[] = [];
  sheetOpen = false;
  protected source: PaletteSource | null = null;
  protected events: PaletteEvents | null = null;
  private contentH = 0;
  private listC = new Container();
  private bg = new Graphics();
  private maskG = new Graphics();
  private views = new Map<string, TileView>();
  private nameStyle = new TextStyle({ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: NAME_SIZE, fill: THEME.tileText });
  private infoStyle = new TextStyle({ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13, fontWeight: 'bold' });
  private infoC = new Container();
  private infoBg = new Graphics();
  private infoTitle = makeText('', 18, THEME.text, { fontWeight: 'bold' });
  private infoLevel = makeText('', 13, THEME.textDim, { fontWeight: 'bold' });
  private infoBody = makeText('', 14, THEME.text, { wordWrap: true, wordWrapWidth: 400, lineHeight: SHEET_LINE_H });
  private infoStatus = makeText('', 13, THEME.textDim, { fontWeight: 'bold' });
  private infoButtons: Record<SheetButtonId, SheetButtonView>;
  private content: SheetContent | null = null;
  private buttonIds: SheetButtonId[];
  private mode: SheetMode;
  private geo: SheetGeometry;
  /** Height of the sheet as currently laid out (0 while closed). */
  private sheetH = 0;

  constructor(protected opts: PaletteOptions) {
    this.buttonIds = opts.buttons;
    this.mode = opts.buttons.length > 1 ? 'full' : 'compact';
    this.sheet = { ...opts.area };
    this.listRect = { ...opts.area };
    this.geo = sheetGeometry(opts.area.w, this.mode, 1, this.buttonIds);

    if (opts.panel) {
      this.bg.rect(opts.area.x, opts.area.y, opts.area.w, opts.area.h + 20).fill(THEME.panel).rect(opts.area.x, opts.area.y, opts.area.w, BORDER_W).fill(THEME.border);
    }
    this.container.addChild(this.bg);
    this.listC.mask = this.maskG;
    this.container.addChild(this.maskG, this.listC);

    this.infoButtons = { place: this.makeSheetButton(), buy: this.makeSheetButton(), upgrade: this.makeSheetButton() };
    this.infoTitle.position.set(SHEET_PAD, SHEET_TITLE_Y);
    this.infoLevel.anchor.set(1, 0);
    this.infoBody.position.set(SHEET_PAD, SHEET_BODY_Y);
    this.infoC.addChild(this.infoBg, this.infoTitle, this.infoLevel, this.infoBody, this.infoStatus);
    for (const b of Object.values(this.infoButtons)) this.infoC.addChild(b.c);
    this.infoC.visible = false;
    this.container.addChild(this.infoC);
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

  /** The count a tile currently shows (null when it has none or was never drawn), for tests. */
  countOf(id: string): string | null {
    return this.views.get(id)?.countText ?? null;
  }

  /** The alpha a tile is drawn with (1 normal, lower when dimmed), for tests; null when it was never drawn. */
  alphaOf(id: string): number | null {
    return this.views.get(id)?.body.alpha ?? null;
  }

  /** Whether a tile shows its padlock, for tests. */
  padlockOf(id: string): boolean {
    return !!this.views.get(id)?.lock.visible;
  }

  /** The name text of a tile as drawn (after the ellipsis), for tests. */
  nameOfTile(id: string): string | null {
    return this.views.get(id)?.name.text ?? null;
  }

  sheetButtonRect(id: SheetButtonId): Rect {
    return { ...this.infoButtons[id].rect };
  }

  /** Whether a sheet button is on screen (a locked block has no buy / upgrade). */
  sheetButtonVisible(id: SheetButtonId): boolean { return this.sheetOpen && this.infoButtons[id].c.visible; }

  get sheetContentNow(): SheetContent | null { return this.sheetOpen ? this.content : null; }

  /** The sheet's rect on screen while it is open, else null. */
  get sheetRect(): Rect | null {
    return this.sheetOpen && this.sheetH > 0 ? { x: this.sheet.x, y: this.sheet.y + this.sheet.h - this.sheetH, w: this.sheet.w, h: this.sheetH } : null;
  }

  hide() {
    this.container.visible = false;
    this.selected = null;
    this.sheetOpen = false;
    this.sheetH = 0;
    this.infoC.visible = false;
  }

  contains(x: number, y: number): boolean {
    return this.isOpen && inRect(this.sheet, x, y);
  }

  inList(x: number, y: number): boolean {
    return this.isOpen && inRect(this.listRect, x, y);
  }

  closeSheet() {
    if (!this.sheetOpen) return;
    this.sheetOpen = false;
    this.build();
  }

  // ------------------------------------------------------------------ building
  /** Re-lays-out the list for the current sheet state and counts. Display objects are reused. */
  build() {
    if (!this.source) return;
    this.updateSheet();
    Object.assign(this.listRect, listRect(this.sheet, this.sheetH));
    const lr = this.listRect;
    this.maskG.clear().rect(lr.x, lr.y, lr.w, lr.h).fill(0xffffff);
    const laid = layoutTiles(this.source.ids(), this.metrics);
    this.tiles = laid.tiles;
    this.contentH = laid.contentH;
    this.scrollY = clampScroll(this.scrollY, this.contentH, this.listRect.h);
    const shown = new Set(this.tiles.map(t => t.id));
    for (const [id, v] of this.views) if (!shown.has(id)) v.c.visible = false;
    for (const t of this.tiles) this.styleTile(t, this.viewOf(t.id));
    this.applyScroll();
  }

  private viewOf(id: string): TileView {
    let v = this.views.get(id);
    if (v) return v;
    const m = this.metrics;
    const px = (m.w - m.plate) / 2;
    const c = new Container();
    const body = new Container();
    const plate = new Graphics();
    plate.position.set(px, 0);
    if (id === REMOVE_TILE) {
      plate.rect(0, 0, m.plate, m.plate).fill(THEME.tilePlate);
      drawX(plate, m.plate / 2, m.plate / 2, 15, THEME.bad, 6);
    } else drawTileIcon(plate, id, m.plate);
    const name = makeText(fitText(nameOf(id), m.w + COL_GAP - 6, (s) => CanvasTextMetrics.measureText(s, this.nameStyle).width), NAME_SIZE, THEME.tileText);
    name.anchor.set(0.5, 0);
    name.position.set(m.w / 2, m.plate + NAME_GAP);
    const count = makeText('', COUNT_SIZE, GREY);
    count.anchor.set(1, 0);
    count.position.set(px + m.plate - 6, 4);
    const lock = new Graphics();
    lock.position.set(px + 7, 7);
    lock.rect(3, 0, 10, 10).fill(GREY).rect(6, 3, 4, 7).cut().rect(0, 9, 16, 12).fill(GREY);
    body.addChild(plate, name, count, lock);
    const frame = new Graphics();
    frame.position.set(px, 0);
    const o = FRAME_GAP + FRAME_W;
    frame.rect(-o, -o, m.plate + 2 * o, m.plate + 2 * o).fill(THEME.select).rect(-FRAME_GAP, -FRAME_GAP, m.plate + 2 * FRAME_GAP, m.plate + 2 * FRAME_GAP).cut();
    c.addChild(body, frame);
    this.listC.addChild(c);
    v = { c, body, name, count, lock, frame, key: '', countText: null };
    this.views.set(id, v);
    return v;
  }

  private styleTile(t: Tile, v: TileView) {
    const src = this.source!;
    const isRemove = t.id === REMOVE_TILE;
    const lockText = isRemove ? null : src.lock(t.id);
    const look = tileLook({ count: isRemove ? null : src.count(t.id), owned: isRemove || src.owned(t.id), locked: !!lockText });
    const sel = this.selected === t.id;
    const key = `${sel ? 1 : 0}|${look.alpha}|${look.count?.text ?? '-'}|${look.count?.faint ? 1 : 0}|${look.padlock ? 1 : 0}`;
    v.c.position.set(t.x, t.y);
    v.c.visible = true;
    if (v.key === key) return;
    v.key = key;
    v.body.alpha = look.alpha;
    v.frame.visible = sel;
    v.count.visible = !!look.count;
    v.countText = look.count?.text ?? null;
    if (look.count) {
      v.count.text = look.count.text;
      v.count.alpha = look.count.faint ? 0.45 : 1;
    }
    v.lock.visible = look.padlock;
  }

  // ------------------------------------------------------------------ info sheet
  private makeSheetButton(): SheetButtonView {
    const c = new Container();
    const bg = new Graphics();
    const label = makeText('', 14, THEME.text, { fontWeight: 'bold', align: 'center', lineHeight: 18 });
    label.anchor.set(0.5);
    c.addChild(bg, label);
    return { c, bg, label, rect: { x: -999, y: -999, w: 0, h: 0 } };
  }

  /** Fills the sheet for the selected tile and sizes it to its text; sets `sheetH` (0 when there is no sheet). */
  private updateSheet() {
    this.infoC.visible = this.sheetOpen && !!this.selected;
    if (!this.infoC.visible) { this.content = null; this.sheetH = 0; return; }
    const c = this.source!.content(this.selected!);
    this.content = c;
    const specs: Record<SheetButtonId, SheetContent['place'] | null> = { place: c.place, buy: c.buy, upgrade: c.upgrade };
    // A locked block has no Buy / Upgrade: the sheet then has no button row.
    const shown = this.buttonIds.filter(id => !!specs[id]);
    const probe = sheetGeometry(this.sheet.w, this.mode, 1, shown);
    this.infoBody.style.wordWrapWidth = probe.textW;
    this.infoTitle.text = c.title;
    this.infoLevel.text = c.levelLine;
    this.infoBody.text = c.body;
    const lines = Math.max(1, Math.round(this.infoBody.height / SHEET_LINE_H));
    this.geo = sheetGeometry(this.sheet.w, this.mode, lines, shown);
    this.sheetH = this.geo.h;
    this.infoStatus.text = fitText(c.ownedLine, this.geo.textW, (s) => CanvasTextMetrics.measureText(s, this.infoStyle).width);
    this.infoStatus.style.fill = c.warn ? THEME.warn : THEME.textDim;
    this.infoStatus.position.set(SHEET_PAD, this.geo.statusY);
    this.infoLevel.position.set(SHEET_PAD + this.geo.textW, SHEET_TITLE_Y + 3);
    const top = this.sheet.y + this.sheet.h - this.sheetH;
    this.infoC.position.set(this.sheet.x, top);
    this.infoBg.clear().rect(0, 0, this.sheet.w, this.sheetH + 20).fill(THEME.panel).rect(0, 0, this.sheet.w, BORDER_W).fill(THEME.border);

    for (const id of ALL_BUTTONS) {
      const v = this.infoButtons[id];
      const spec = this.buttonIds.includes(id) ? specs[id] : null;
      const r = this.geo.buttons[id];
      v.c.visible = !!spec && !!r;
      if (!spec || !r) { v.rect = { x: -999, y: -999, w: 0, h: 0 }; continue; }
      v.rect = { x: this.sheet.x + r.x, y: top + r.y, w: r.w, h: r.h };
      v.c.position.set(r.x, r.y);
      v.label.position.set(Math.round(r.w / 2), Math.round(r.h / 2));
      v.label.text = spec.label;
      v.label.style.fill = spec.enabled ? THEME.text : THEME.disabled;
      v.bg.clear().rect(0, 0, r.w, r.h).fill(spec.enabled ? THEME.buttonLine : THEME.disabled)
        .rect(BORDER_W, BORDER_W, r.w - 2 * BORDER_W, r.h - 2 * BORDER_W).fill(THEME.buttonFill);
    }
  }

  /** Redraws counts, prices and the sheet after a purchase. */
  refresh() {
    if (this.isOpen) this.build();
  }

  // ------------------------------------------------------------------ scrolling
  private applyScroll() {
    this.scrollY = clampScroll(this.scrollY, this.contentH, this.listRect.h);
    this.listC.position.set(0, this.listRect.y - Math.round(this.scrollY));
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
   * A tap in a gap between tiles does nothing.
   */
  tap(x: number, y: number): boolean {
    if (!this.contains(x, y)) return false;
    const sr = this.sheetRect;
    if (sr && inRect(sr, x, y)) { this.tapSheet(x, y); return true; }
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
    if (button === 'place' && !c.place.enabled) { this.events!.onMessage(c.place.hint ?? `No ${c.title} left`); return; }
    this.events!.onButton(id, button);
  }
}
