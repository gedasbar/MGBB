import { Container, Graphics } from 'pixi.js';
import { inRect, Rect } from './layout';
import { makeText } from './ui';
import { getProgressStore } from '../econ/progress';
import { THEME, UI } from '../ui/theme';
import { drawTileFace } from '../ui/widgets';
import { sfx } from '../audio';
import { fmtBig } from '../ui/format';
import { SKIN_AUTO, TRAIL_STYLE_DEFAULT } from '../ui/settings';
import { ALL_LOOKS, SHOT_LOOKS, ShotLook } from '../ui/shotLook';
import { shotPolygon } from '../ui/shotTextures';
import { resolveSkin, resolveTrailStyle, skinUnlocked, SKINS, trailUnlocked, TRAIL_STYLES, unlockHint } from '../ui/cosmetics';
import { TRAIL_ALPHA_FAR, TRAIL_ALPHA_NEAR, trailColor } from '../ui/shotTrails';
import { clampScroll } from './paletteLogic';
import { drawHubFrame, hubBodyRect, hubTabAt, HubTab, HUB_PANEL, HUB_TAB_H } from './hub';

const PAD = 12;
const GAP = 8;
const COLS = 3;
const TILE_H = 122;
const HEAD_H = 32;

export interface CustomizePanelEvents {
  tab(t: HubTab): void;
  /** A short message (why a locked item is locked). */
  toast(text: string): void;
}

interface Tile { id: string; kind: 'skin' | 'trail'; rect: Rect; unlocked: boolean; selected: boolean; hint: string }

/**
 * Chunk 28b: the CUSTOMIZATION tab of the hub. PROJECTILE SKIN: Auto (the look follows damage) or one look locked for every shot; the five damage-band looks unlock when the best
 * shot reaches their band, the three reward skins by the achievement or challenge that pays them. TRAILS: the colour style of the fading trail behind shots (its length,
 * Off / Short / Long, is in Settings > Graphics). A locked tile only says LOCKED (29a); tapping it names what unlocks it in a toast. What is chosen is saved with the settings.
 */
export class CustomizePanel {
  readonly container = new Container();
  isOpen = false;
  scrollY = 0;
  private contentH = 0;
  private listC = new Container();
  private maskG = new Graphics();
  private tiles: Tile[] = [];

  constructor(private events: CustomizePanelEvents) {
    this.container.visible = false;
  }

  private get listRect(): Rect { return hubBodyRect(); }

  open() {
    this.isOpen = true;
    this.scrollY = 0;
    this.container.visible = true;
    this.refresh();
  }

  close() {
    this.isOpen = false;
    this.container.visible = false;
  }

  inList(x: number, y: number): boolean { return this.isOpen && inRect(this.listRect, x, y); }

  scrollBy(dy: number) {
    this.scrollY = clampScroll(this.scrollY + dy, this.contentH, this.listRect.h);
    this.listC.position.set(this.listRect.x, this.listRect.y - this.scrollY);
  }

  tap(x: number, y: number) {
    if (!inRect(HUB_PANEL, x, y)) { this.close(); return; }
    if (y < HUB_PANEL.y + HUB_TAB_H) { const t = hubTabAt(x, y); if (t && t !== 'custom') this.events.tab(t); return; }
    const lr = this.listRect;
    for (const t of this.tiles) {
      const r = { x: lr.x + t.rect.x, y: lr.y + t.rect.y - this.scrollY, w: t.rect.w, h: t.rect.h };
      if (!inRect(r, x, y) || !inRect(lr, x, y)) continue;
      this.choose(t);
      return;
    }
  }

  private choose(t: Tile) {
    if (!t.unlocked) { sfx.play('denied'); this.events.toast(t.hint ? `Locked: ${t.hint}` : 'Locked'); return; }
    sfx.set(t.kind === 'skin' ? 'shotSkin' : 'trailStyle', t.id);
    this.refresh();
  }

  /** Screen rectangle of a tile by id (scrolled into view first), for tests. */
  tileRect(id: string): Rect | null {
    const t = this.tiles.find(tt => tt.id === id);
    if (!t) return null;
    const lr = this.listRect;
    if (t.rect.y < this.scrollY) this.scrollBy(t.rect.y - this.scrollY - 8);
    else if (t.rect.y + t.rect.h > this.scrollY + lr.h) this.scrollBy(t.rect.y + t.rect.h - this.scrollY - lr.h + 8);
    return { x: lr.x + t.rect.x, y: lr.y + t.rect.y - this.scrollY, w: t.rect.w, h: t.rect.h };
  }

  state() {
    return { isOpen: this.isOpen, scrollY: this.scrollY, contentH: this.contentH, tiles: this.tiles.map(t => ({ id: t.id, kind: t.kind, unlocked: t.unlocked, selected: t.selected, hint: t.hint })) };
  }

  // ------------------------------------------------------------------ drawing
  refresh() {
    if (!this.isOpen) return;
    for (const ch of this.container.removeChildren()) if (ch !== this.listC && ch !== this.maskG) ch.destroy({ children: true });
    for (const ch of this.listC.removeChildren()) ch.destroy({ children: true });
    const frame = new Container();
    drawHubFrame(frame, 'custom');
    this.container.addChild(frame, this.listC);
    const lr = this.listRect;
    this.maskG.clear().rect(lr.x, lr.y, lr.w, lr.h).fill(0xffffff);
    this.listC.mask = this.maskG;
    this.container.addChild(this.maskG);
    this.drawList();
    this.scrollBy(0);
  }

  /** A section header (29a: the header alone, no helper line under it). */
  private head(text: string, y: number) {
    const t = makeText(text, UI.text.header, UI.color.accent, { fontWeight: 'bold' });
    t.position.set(PAD, y + 4);
    this.listC.addChild(t);
  }

  private drawList() {
    const p = getProgressStore().data;
    const skinSel = resolveSkin(sfx.settings.shotSkin, p)?.id ?? SKIN_AUTO;
    const trailSel = resolveTrailStyle(sfx.settings.trailStyle, p).id;
    this.tiles = [];
    const tw = (HUB_PANEL.w - 2 * PAD - (COLS - 1) * GAP) / COLS;
    let y = 6;
    this.head('PROJECTILE SKIN', y);
    y += HEAD_H;
    // Auto first, then the eight looks.
    const skinTiles: { id: string; name: string; unlocked: boolean; hint: string; look: ShotLook | null }[] = [
      { id: SKIN_AUTO, name: 'Auto', unlocked: true, hint: '', look: null },
      ...SKINS.map(s => ({ id: s.id, name: s.name, unlocked: skinUnlocked(s, p), hint: unlockHint(s.unlock, fmtBig), look: ALL_LOOKS[s.look] })),
    ];
    skinTiles.forEach((s, i) => {
      const r: Rect = { x: PAD + (i % COLS) * (tw + GAP), y: y + Math.floor(i / COLS) * (TILE_H + GAP), w: tw, h: TILE_H };
      const tile: Tile = { id: s.id, kind: 'skin', rect: r, unlocked: s.unlocked, selected: skinSel === s.id, hint: s.hint };
      this.tiles.push(tile);
      this.drawTile(tile, s.name, (g, cx, cy) => (s.look ? this.drawLook(g, s.look, cx, cy, 1.5) : this.drawAutoSet(g, cx, cy)));
    });
    y += Math.ceil(skinTiles.length / COLS) * (TILE_H + GAP) + 10;
    this.head('SHOT TRAIL', y);
    y += HEAD_H;
    TRAIL_STYLES.forEach((t, i) => {
      const r: Rect = { x: PAD + (i % COLS) * (tw + GAP), y: y + Math.floor(i / COLS) * (TILE_H + GAP), w: tw, h: TILE_H };
      const tile: Tile = { id: t.id, kind: 'trail', rect: r, unlocked: trailUnlocked(t, p), selected: trailSel === t.id, hint: unlockHint(t.unlock, fmtBig) };
      this.tiles.push(tile);
      this.drawTile(tile, t.name, (g, cx, cy) => this.drawTrail(g, t.colors, cx, cy));
    });
    y += Math.ceil(TRAIL_STYLES.length / COLS) * (TILE_H + GAP) + 6;
    this.contentH = y + PAD;
    void TRAIL_STYLE_DEFAULT;
  }

  /** One tile: a frame, a preview drawn by `art` at the tile's upper centre, the name and the status line. */
  private drawTile(t: Tile, name: string, art: (g: Graphics, cx: number, cy: number) => void) {
    const r = t.rect;
    const g = drawTileFace(new Graphics(), r, { selected: t.selected });
    const preview = new Graphics();
    art(preview, r.x + r.w / 2, r.y + 44);
    if (!t.unlocked) preview.alpha = 0.3;
    const label = makeText(name, 14, t.unlocked ? THEME.text : THEME.textDim, { fontWeight: 'bold', align: 'center', wordWrap: true, wordWrapWidth: r.w - 8 });
    label.anchor.set(0.5, 0);
    label.position.set(r.x + r.w / 2, r.y + 80);
    const status = makeText(t.selected ? 'SELECTED' : t.unlocked ? '' : 'LOCKED', UI.text.small, t.selected ? THEME.good : t.unlocked ? THEME.textDim : THEME.warn, { fontWeight: 'bold', align: 'center', wordWrap: true, wordWrapWidth: r.w - 8 });
    status.anchor.set(0.5, 0);
    status.position.set(r.x + r.w / 2, r.y + 80 + label.height + 1);
    this.listC.addChild(g, preview, label, status);
    if (!t.unlocked) this.drawLock(preview, r.x + r.w / 2, r.y + 44);
  }

  /** A padlock over a locked preview (drawn at full strength: the preview itself is dimmed). */
  private drawLock(into: Graphics, cx: number, cy: number) {
    const lock = new Graphics().roundRect(cx - 11, cy - 3, 22, 18, 3).fill(THEME.textDim).stroke({ color: THEME.text, width: 1.5 })
      .moveTo(cx - 6, cy - 3).lineTo(cx - 6, cy - 10).lineTo(cx + 6, cy - 10).lineTo(cx + 6, cy - 3).stroke({ color: THEME.text, width: 2.5 });
    this.listC.addChild(lock);
    void into;
  }

  /** A shot look drawn as its polygon, scaled. */
  private drawLook(g: Graphics, look: ShotLook, cx: number, cy: number, scale: number) {
    const w = look.w * scale, h = look.h * scale;
    const poly = shotPolygon(look.shape, w, h).map((v, i) => v - (i % 2 === 0 ? w / 2 : h / 2) + (i % 2 === 0 ? cx : cy));
    g.poly(poly).fill(look.color);
  }

  /** Auto's preview: the five band looks in a row, small. */
  private drawAutoSet(g: Graphics, cx: number, cy: number) {
    SHOT_LOOKS.forEach((l, i) => this.drawLook(g, l, cx + (i - 2) * 22, cy, 0.7));
  }

  /** A trail preview: a shot with its segments behind it, the way the game draws them (a vertical line of segments). */
  private drawTrail(g: Graphics, colors: readonly number[] | null, cx: number, cy: number) {
    const shot = SHOT_LOOKS[2];
    const segs = 5, step = 9;
    for (let k = 0; k < segs; k++) {
      const f = k / (segs - 1);
      const w = Math.max(3, 14 * (0.85 - 0.55 * f));
      const a = TRAIL_ALPHA_NEAR + (TRAIL_ALPHA_FAR - TRAIL_ALPHA_NEAR) * f;
      g.rect(cx - w / 2, cy + 4 + k * step, w, step - 1).fill({ color: trailColor(colors, k, shot.color), alpha: a });
    }
    this.drawLook(g, shot, cx, cy - 8, 1);
  }
}
