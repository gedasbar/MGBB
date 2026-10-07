import { Container, Graphics } from 'pixi.js';
import { BLOCKS, CATEGORY_LABEL, pickerBlocks } from '../data/blocks';
import { BlockCategory } from '../engine/compilerTypes';
import { BuilderModel } from './model';
import { CATEGORY_COLOR, COLORS, drawBlockIcon, drawX } from './draw';
import { inRect, LAYOUT, Rect } from './layout';
import { makeText } from './ui';

export const REMOVE_TILE = '__remove';

export interface PickerEvents {
  /** Single tap on a tile (or REMOVE_TILE): highlight and preview it. */
  onHighlight(id: string): void;
  /** Double tap on a tile: place the block (or remove). */
  onPlace(id: string): void;
  onClose(): void;
  onMessage(msg: string): void;
}

interface Tile { id: string; x: number; y: number; w: number; h: number }
interface Header { text: string; y: number; cat: BlockCategory }

const HEADER_H = 44;
const TILE_W = 125;
const TILE_H = 104;
const GAP = 8;
const SECTION_H = 26;
const ORDER: BlockCategory[] = ['pathing', 'damage', 'modifier', 'status', 'mitosis', 'passive'];

/** The bottom sheet with a scrollable grid of tiles. */
export class Picker {
  readonly container = new Container();
  readonly sheet: Rect = { ...LAYOUT.sheet };
  readonly closeRect: Rect;
  readonly listRect: Rect;
  scrollY = 0;
  selected: string | null = null;
  target: { x: number; y: number } | null = null;
  tiles: Tile[] = [];
  private headers: Header[] = [];
  private contentH = 0;
  private listC = new Container();
  private bg = new Graphics();
  private titleText = makeText('', 16, 0xffffff, { fontWeight: 'bold' });
  private hintText = makeText('Tap a tile to preview · double-tap to place', 12, COLORS.textDim);
  private maskG = new Graphics();
  private model: BuilderModel | null = null;
  private events: PickerEvents | null = null;

  constructor() {
    const s = this.sheet;
    this.closeRect = { x: s.x + s.w - 48, y: s.y, w: 48, h: HEADER_H };
    this.listRect = { x: s.x, y: s.y + HEADER_H, w: s.w, h: s.h - HEADER_H };
    this.bg.roundRect(s.x, s.y, s.w, s.h + 20, 16).fill(0x303030).stroke({ color: COLORS.red, width: 2 });
    this.bg.rect(s.x, s.y + HEADER_H - 1, s.w, 1).fill(0x1a1a1a);
    drawX(this.bg, this.closeRect.x + 24, this.closeRect.y + 22, 8, 0xffffff, 3);
    this.titleText.position.set(14, s.y + 5);
    this.hintText.position.set(14, s.y + 25);
    this.maskG.rect(this.listRect.x, this.listRect.y, this.listRect.w, this.listRect.h).fill(0xffffff);
    this.listC.mask = this.maskG;
    this.container.addChild(this.bg, this.titleText, this.hintText, this.maskG, this.listC);
    this.container.visible = false;
  }

  get isOpen(): boolean { return this.container.visible; }

  open(model: BuilderModel, target: { x: number; y: number }, events: PickerEvents) {
    this.model = model;
    this.events = events;
    this.target = target;
    this.scrollY = 0;
    const cell = model.cellAt(target.x, target.y);
    this.selected = cell?.blockId ?? null;
    this.titleText.text = `Build at column ${target.x + 1}, row ${target.y + 1}`;
    this.build();
    this.container.visible = true;
    this.applyScroll();
  }

  close() {
    this.container.visible = false;
    this.selected = null;
    this.target = null;
  }

  contains(x: number, y: number): boolean {
    return this.isOpen && inRect(this.sheet, x, y);
  }

  inList(x: number, y: number): boolean {
    return this.isOpen && inRect(this.listRect, x, y);
  }

  /** Rebuilds the tile list (also after a count changes). */
  build() {
    const model = this.model!;
    const cell = model.cellAt(this.target!.x, this.target!.y);
    for (const ch of this.listC.removeChildren()) ch.destroy({ children: true });
    this.tiles = [];
    this.headers = [];
    let y = GAP;
    const cols = 4;
    const place = (id: string, idx: number, rowY: number) => {
      const t: Tile = { id, x: GAP + (idx % cols) * (TILE_W + GAP), y: rowY, w: TILE_W, h: TILE_H };
      this.tiles.push(t);
      return t;
    };
    if (cell?.blockId) {
      this.headers.push({ text: 'Current block', y, cat: 'passive' });
      y += SECTION_H;
      place(REMOVE_TILE, 0, y);
      y += TILE_H + GAP;
    }
    for (const cat of ORDER) {
      const blocks = pickerBlocks().filter(b => b.category === cat);
      if (blocks.length === 0) continue;
      this.headers.push({ text: CATEGORY_LABEL[cat], y, cat });
      y += SECTION_H;
      blocks.forEach((b, i) => place(b.id, i, y + Math.floor(i / cols) * (TILE_H + GAP)));
      y += Math.ceil(blocks.length / cols) * (TILE_H + GAP);
    }
    this.contentH = y;

    for (const h of this.headers) {
      const t = makeText(h.text.toUpperCase(), 12, h.cat === 'passive' ? COLORS.textDim : CATEGORY_COLOR[h.cat], { fontWeight: 'bold', letterSpacing: 1 });
      t.position.set(GAP + 2, h.y + 4);
      this.listC.addChild(t);
    }
    this.drawTiles(cell?.blockId ?? null);
  }

  private drawTiles(currentId: string | null) {
    const model = this.model!;
    const g = new Graphics();
    this.listC.addChild(g);
    for (const t of this.tiles) {
      const isRemove = t.id === REMOVE_TILE;
      const def = isRemove ? null : BLOCKS[t.id];
      const color = isRemove ? COLORS.red : CATEGORY_COLOR[def!.category];
      const avail = isRemove ? 1 : model.available(t.id);
      const sel = this.selected === t.id;
      g.roundRect(t.x, t.y, t.w, t.h, 10).fill({ color: sel ? 0x4b5a4b : 0x3f3f3f, alpha: avail > 0 ? 1 : 0.55 });
      g.roundRect(t.x, t.y, t.w, t.h, 10).stroke({ color: sel ? COLORS.green : t.id === currentId ? 0xffe14d : color, width: sel ? 4 : 2, alpha: avail > 0 ? 1 : 0.4 });
      const icon = new Graphics();
      icon.position.set(t.x + t.w / 2, t.y + 34);
      if (isRemove) drawX(icon, 0, 0, 14, COLORS.red, 5);
      else drawBlockIcon(icon, t.id, 38, color);
      icon.alpha = avail > 0 ? 1 : 0.4;
      this.listC.addChild(icon);
      const name = makeText(isRemove ? 'Remove' : def!.name, 13, 0xffffff, { fontWeight: 'bold', align: 'center', wordWrap: true, wordWrapWidth: t.w - 10 });
      name.anchor.set(0.5, 0);
      name.position.set(t.x + t.w / 2, t.y + 62);
      name.alpha = avail > 0 ? 1 : 0.5;
      this.listC.addChild(name);
      const count = makeText(isRemove ? 'returns it' : `×${avail}`, 12, avail > 0 ? COLORS.textDim : 0xff6a6a, { fontWeight: 'bold' });
      count.anchor.set(0.5, 1);
      count.position.set(t.x + t.w / 2, t.y + t.h - 5);
      this.listC.addChild(count);
      if (t.id === currentId) {
        const here = makeText('here', 10, 0xffe14d, { fontWeight: 'bold' });
        here.position.set(t.x + 7, t.y + 5);
        this.listC.addChild(here);
      }
    }
  }

  private maxScroll(): number {
    return Math.max(0, this.contentH + GAP - this.listRect.h);
  }

  private applyScroll() {
    this.scrollY = Math.max(0, Math.min(this.maxScroll(), this.scrollY));
    this.listC.position.set(0, this.listRect.y - this.scrollY);
  }

  scrollBy(dy: number) {
    this.scrollY += dy;
    this.applyScroll();
  }

  tileAt(x: number, y: number): Tile | null {
    if (!this.inList(x, y)) return null;
    const cy = y - this.listRect.y + this.scrollY;
    return this.tiles.find(t => x >= t.x && x < t.x + t.w && cy >= t.y && cy < t.y + t.h) ?? null;
  }

  /** Content position (screen px) of a tile's top-left, for tests. */
  tileScreenRect(id: string): Rect | null {
    const t = this.tiles.find(tt => tt.id === id);
    if (!t) return null;
    return { x: t.x, y: this.listRect.y + t.y - this.scrollY, w: t.w, h: t.h };
  }

  /** Scrolls so a tile is fully visible. */
  reveal(id: string) {
    const t = this.tiles.find(tt => tt.id === id);
    if (!t) return;
    if (t.y < this.scrollY) this.scrollY = t.y - GAP;
    else if (t.y + t.h > this.scrollY + this.listRect.h) this.scrollY = t.y + t.h - this.listRect.h + GAP;
    this.applyScroll();
  }

  highlight(id: string) {
    this.selected = id;
    this.build();
    this.applyScroll();
  }

  /** Returns true when the tap was inside the sheet (consumed). */
  tap(x: number, y: number): boolean {
    if (!this.contains(x, y)) return false;
    if (inRect(this.closeRect, x, y)) { this.events!.onClose(); return true; }
    const t = this.tileAt(x, y);
    if (t) this.events!.onHighlight(t.id);
    return true;
  }

  doubleTap(x: number, y: number): boolean {
    if (!this.contains(x, y)) return false;
    if (inRect(this.closeRect, x, y)) { this.events!.onClose(); return true; }
    const t = this.tileAt(x, y);
    if (!t) return true;
    if (t.id !== REMOVE_TILE && this.model!.available(t.id) <= 0) {
      this.events!.onMessage(`No ${BLOCKS[t.id].name} left`);
      return true;
    }
    this.events!.onPlace(t.id);
    return true;
  }

  wheel(deltaY: number) {
    this.scrollBy(deltaY);
  }

  get maxScrollValue(): number { return this.maxScroll(); }
}

