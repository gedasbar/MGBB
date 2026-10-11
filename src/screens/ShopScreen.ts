import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { MapScreen } from './MapScreen';
import { GestureTracker } from '../builder/gestures';
import { getBuilderModel } from '../builder/session';
import { inRect, LAYOUT, Rect, VIEW_H, VIEW_W } from '../builder/layout';
import { makeTabButtons } from '../builder/tabs';
import { Inspector, makeText, Toast, UIButton } from '../builder/ui';
import { CATEGORY_COLOR } from '../builder/draw';
import { BLOCKS, pickerBlocks } from '../data/blocks';
import { describeBlock } from '../engine/compilerTypes';
import { copyPrice, HULL_PRICE, maxLevelOf, upgradePrice } from '../econ/economy';
import { HULL_INFO } from '../game/gridUtils';
import { shipThumbnail } from '../ui/shipArt';
import { drawPlate } from '../ui/blockArt';
import { fmtBig } from '../ui/format';
import { CreditsBadge } from '../ui/hud';
import { THEME } from '../ui/theme';

type Section = 'blocks' | 'hulls';

const LIST_TOP = 164;
const LIST_BOTTOM = LAYOUT.tabs.y;
const ROW_H = 84;
const ROW_GAP = 6;
const ROW_X = 8;
const ROW_W = VIEW_W - 16;

interface ShopButton { kind: 'buy' | 'upgrade' | 'hull'; id: string; rect: Rect; enabled: boolean; label: string; }
interface ShopRow { key: string; rect: Rect; buttons: ShopButton[]; }

/** The Shop tab: buy copies and upgrade levels of blocks, and buy hulls. Rows are drawn in a masked, scrollable list. */
export class ShopScreen implements Screen {
  statsName = 'Shop';
  container = new Container();
  private model = getBuilderModel();
  private store = this.model.store;
  private credits = new CreditsBadge();
  private inspector = new Inspector();
  private toast = new Toast();
  private tabs: UIButton[] = [];
  private sectionButtons: Record<Section, UIButton>;
  private listC = new Container();
  private mask = new Graphics();
  private gestures: GestureTracker | null = null;
  private unsubscribe: (() => void) | null = null;

  section: Section = 'blocks';
  selected: string | null = null;
  scrollY = 0;
  rows: ShopRow[] = [];
  private contentH = 0;

  constructor(private sm: ScreenManager) {
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(THEME.bg);
    const top = LAYOUT.top;
    const bar = new Graphics()
      .rect(top.x, top.y, top.w, top.h).fill(THEME.panel).rect(0, top.h - 1, VIEW_W, 1).fill(THEME.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(THEME.panel)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(THEME.border);
    const title = makeText('Shop', 32, THEME.text, { fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 27);
    this.credits.set(this.store.data.credits);

    this.mask.rect(0, LIST_TOP, VIEW_W, LIST_BOTTOM - LIST_TOP).fill(0xffffff);
    this.listC.mask = this.mask;
    this.container.addChild(bg, this.listC, this.mask, bar, this.inspector.container, title, this.credits.container);

    this.sectionButtons = {
      blocks: this.sectionButton('sectionBlocks', 'Blocks', 0, 'blocks'),
      hulls: this.sectionButton('sectionHulls', 'Hulls', VIEW_W / 2, 'hulls'),
    };
    this.tabs = makeTabButtons('tabShop', (id) => this.tapTab(id));
    for (const b of this.tabs) this.container.addChild(b.container);
    this.container.addChild(this.toast.container);

    this.setSection('blocks');
    this.installDevHook();
  }

  private sectionButton(id: string, label: string, x: number, section: Section): UIButton {
    const w = VIEW_W / 2;
    const t = makeText(label, 18, THEME.text, { fontWeight: 'bold' });
    t.anchor.set(0.5);
    t.position.set(w / 2, 20);
    const b = new UIButton({
      id, rect: { x, y: LAYOUT.inspector.y + LAYOUT.inspector.h, w, h: 40 }, onTap: () => this.setSection(section),
      draw: (g, bb) => {
        const lit = bb.lit;
        g.rect(1, 1, w - 2, 38).fill(lit ? THEME.pressedFill : THEME.buttonFill).stroke({ color: THEME.buttonLine, width: 1.5 });
        t.style.fill = lit ? THEME.pressedIcon : THEME.text;
      },
    });
    b.container.addChild(t);
    b.redraw();
    this.container.addChild(b.container);
    return b;
  }

  // ------------------------------------------------------------------ lifecycle
  init() {
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => this.tap(x, y),
        onDrag: (_dx, dy) => this.scrollBy(-dy),
        onPinch: () => {},
        onWheel: (dy, x, y) => { if (this.inList(x, y)) this.scrollBy(dy); },
        canDrag: (x, y) => this.inList(x, y),
      },
    );
    this.gestures.attach();
    this.unsubscribe = this.store.onChange(() => {
      this.credits.set(this.store.data.credits);
      this.rebuild();
    });
  }

  destroy() {
    this.gestures?.detach();
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }

  update(dt: number) {
    this.toast.update(dt * 1000);
  }

  private installDevHook() {
    if (!import.meta.env.DEV) return;
    (window as any).__mgbm = {
      screen: 'shop',
      shopScreen: this,
      state: () => ({
        credits: this.store.data.credits,
        creditsText: this.credits.text,
        section: this.section,
        selected: this.selected,
        scrollY: this.scrollY,
        toast: this.toast.message,
        inspector: { title: this.inspector.titleText, body: this.inspector.bodyText },
        rows: this.rows.map(r => ({
          key: r.key,
          rect: this.screenRect(r.rect),
          buttons: r.buttons.map(b => ({ kind: b.kind, label: b.label, enabled: b.enabled, rect: this.screenRect(b.rect) })),
        })),
      }),
    };
  }

  // ------------------------------------------------------------------ list
  private inList(x: number, y: number) {
    return y >= LIST_TOP && y < LIST_BOTTOM && x >= 0 && x < VIEW_W;
  }

  private screenRect(r: Rect): Rect {
    return { x: r.x, y: LIST_TOP + r.y - this.scrollY, w: r.w, h: r.h };
  }

  private applyScroll() {
    const max = Math.max(0, this.contentH - (LIST_BOTTOM - LIST_TOP));
    this.scrollY = Math.max(0, Math.min(max, this.scrollY));
    this.listC.position.set(0, LIST_TOP - this.scrollY);
  }

  scrollBy(dy: number) {
    this.scrollY += dy;
    this.applyScroll();
  }

  setSection(s: Section) {
    this.section = s;
    this.sectionButtons.blocks.setActive(s === 'blocks');
    this.sectionButtons.hulls.setActive(s === 'hulls');
    this.scrollY = 0;
    this.selected = null;
    this.inspector.set(s === 'blocks' ? 'Block shop' : 'Hull shop', s === 'blocks'
      ? 'Tap a block to read its rule. Buy more copies to build with, or upgrade its level to strengthen it.'
      : 'Tap a hull to read about it. A bought hull appears in the hull picker on the Build screen.');
    this.rebuild();
  }

  private blockButtons(id: string, y: number): ShopButton[] {
    const p = this.store.data;
    const buyPrice = copyPrice(id, p.owned[id] ?? 0);
    const level = p.levels[id] ?? 1;
    const max = maxLevelOf(id);
    const upPrice = level < max ? upgradePrice(id, level) : 0;
    const bx = ROW_X + ROW_W - 258;
    return [
      { kind: 'buy', id, rect: { x: bx, y: y + 8, w: 250, h: 32 }, enabled: p.credits >= buyPrice, label: `Buy x1 - ${fmtBig(buyPrice)}` },
      {
        kind: 'upgrade', id, rect: { x: bx, y: y + 44, w: 250, h: 32 }, enabled: level < max && p.credits >= upPrice,
        label: level < max ? `Upgrade L${level} -> L${level + 1} - ${fmtBig(upPrice)}` : 'MAX',
      },
    ];
  }

  private hullButton(id: string, y: number): ShopButton {
    const p = this.store.data;
    const owned = p.ownedHulls.includes(id);
    const price = HULL_PRICE[id] ?? 0;
    return {
      kind: 'hull', id, rect: { x: ROW_X + ROW_W - 158, y: y + 26, w: 150, h: 32 },
      enabled: !owned && p.credits >= price, label: owned ? 'Owned' : `Buy - ${fmtBig(price)}`,
    };
  }

  /** Redraws the whole list (after a purchase, a section change or a selection change). */
  private rebuild() {
    for (const ch of this.listC.removeChildren()) ch.destroy({ children: true });
    this.rows = [];
    const p = this.store.data;
    const keys = this.section === 'blocks' ? pickerBlocks().map(b => b.id) : HULL_INFO.map(h => h.id);
    keys.forEach((key, i) => {
      const y = ROW_GAP + i * (ROW_H + ROW_GAP);
      const rect: Rect = { x: ROW_X, y, w: ROW_W, h: ROW_H };
      const buttons = this.section === 'blocks' ? this.blockButtons(key, y) : [this.hullButton(key, y)];
      this.rows.push({ key, rect, buttons });
      const sel = this.selected === key;
      const g = new Graphics();
      g.rect(rect.x, rect.y, rect.w, rect.h).fill(THEME.panel).stroke({ color: sel ? THEME.select : THEME.border, width: sel ? THEME.selectWidth : 1.5 });
      this.listC.addChild(g);
      if (this.section === 'blocks') {
        const def = BLOCKS[key];
        const plate = new Graphics();
        plate.position.set(rect.x + 42, rect.y + ROW_H / 2);
        drawPlate(plate, key, 56, 0);
        this.listC.addChild(plate);
        const name = makeText(def.name, 17, THEME.text, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: 170 });
        name.position.set(rect.x + 82, rect.y + 12);
        const info = makeText(`Owned ${p.owned[key] ?? 0} · Lv ${p.levels[key] ?? 1}/${maxLevelOf(key)}`, 13, THEME.textDim, { fontWeight: 'bold' });
        info.position.set(rect.x + 82, rect.y + ROW_H - 28);
        const strip = new Graphics().rect(rect.x, rect.y, 4, rect.h).fill(CATEGORY_COLOR[def.category]);
        this.listC.addChild(strip, name, info);
      } else {
        const info = HULL_INFO.find(h => h.id === key)!;
        this.drawHullMini(key, rect.x + 10, rect.y + 9);
        const owned = p.ownedHulls.includes(key);
        const name = makeText(info.name, 17, THEME.text, { fontWeight: 'bold' });
        name.position.set(rect.x + 88, rect.y + 12);
        const desc = makeText(owned ? 'Owned' : `Price ${fmtBig(HULL_PRICE[key] ?? 0)}`, 13, owned ? THEME.good : THEME.currency, { fontWeight: 'bold' });
        desc.position.set(rect.x + 88, rect.y + ROW_H - 28);
        this.listC.addChild(name, desc);
      }
      for (const b of buttons) this.drawButton(b);
    });
    this.contentH = ROW_GAP + keys.length * (ROW_H + ROW_GAP);
    this.applyScroll();
  }

  /** The hull's ship art as a thumbnail (the same renderer as the Fly screens). */
  private drawHullMini(hullId: string, x: number, y: number) {
    const s = shipThumbnail(this.sm.app.renderer, hullId, 62);
    s.position.set(x + 33, y + 33);
    this.listC.addChild(s);
  }

  private drawButton(b: ShopButton) {
    const g = new Graphics();
    const off = !b.enabled;
    g.rect(b.rect.x + 1, b.rect.y + 1, b.rect.w - 2, b.rect.h - 2).fill(THEME.buttonFill).stroke({ color: off ? THEME.disabled : THEME.buttonLine, width: 1.5 });
    const t = makeText(b.label, 14, off ? THEME.disabled : THEME.text, { fontWeight: 'bold' });
    t.anchor.set(0.5);
    t.position.set(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    this.listC.addChild(g, t);
  }

  // ------------------------------------------------------------------ input
  private tap(x: number, y: number) {
    for (const b of [...this.tabs, this.sectionButtons.blocks, this.sectionButtons.hulls]) {
      if (b.hit(x, y)) { b.flash(); b.spec.onTap(); return; }
    }
    if (!this.inList(x, y)) return;
    const cy = y - LIST_TOP + this.scrollY;
    for (const row of this.rows) {
      if (!inRect(row.rect, x, cy)) continue;
      const btn = row.buttons.find(b => inRect(b.rect, x, cy));
      if (btn) this.press(btn);
      else this.select(row.key);
      return;
    }
  }

  private tapTab(id: string) {
    if (id === 'tabShop') return;
    if (id === 'tabBuild') { this.sm.switchTo(new BuildScreen(this.sm)); return; }
    if (id === 'tabMap') { this.sm.switchTo(new MapScreen(this.sm)); return; }
    this.toast.show('Coming soon');
  }

  select(key: string) {
    this.selected = key;
    if (this.section === 'blocks') {
      const def = BLOCKS[key];
      const level = this.store.data.levels[key] ?? 1;
      this.inspector.set(`${def.name} · Lv ${level}`, describeBlock(def, level));
    } else {
      const h = HULL_INFO.find(hh => hh.id === key)!;
      this.inspector.set(h.name, h.desc);
    }
    this.rebuild();
  }

  private press(b: ShopButton) {
    if (!b.enabled) {
      this.toast.show(b.kind !== 'hull' && b.label === 'MAX' ? 'Already at max level' : 'Not enough credits');
      return;
    }
    if (b.kind === 'buy') {
      const r = this.store.buyCopy(b.id);
      if (r.ok) this.toast.show(`Bought ${BLOCKS[b.id].name} for ${fmtBig(r.price)}`, 1600);
      else this.toast.show(r.error);
    } else if (b.kind === 'upgrade') {
      const r = this.store.buyUpgrade(b.id);
      if (r.ok) {
        this.model.refreshLevels();
        this.toast.show(`${BLOCKS[b.id].name} is now level ${this.store.data.levels[b.id]}`, 1600);
        if (this.selected === b.id) this.select(b.id);
      } else this.toast.show(r.error);
    } else {
      const r = this.store.buyHull(b.id);
      if (r.ok) this.toast.show(`Bought the ${HULL_INFO.find(h => h.id === b.id)?.name ?? b.id} hull`, 1600);
      else this.toast.show(r.error);
    }
  }
}
