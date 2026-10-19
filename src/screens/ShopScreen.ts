import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { MapScreen } from './MapScreen';
import { CaptainScreen } from './CaptainScreen';
import { GestureTracker } from '../builder/gestures';
import { getBuilderModel } from '../builder/session';
import { inRect, LAYOUT, Rect, VIEW_H, VIEW_W } from '../builder/layout';
import { makeTabButtons } from '../builder/tabs';
import { sfx } from '../audio';
import { Inspector, makeText, Toast, UIButton } from '../builder/ui';
import { BLOCKS, pickerBlocks } from '../data/blocks';
import { describeBlock } from '../engine/compilerTypes';
import { copyPrice, HULL_PRICE, maxLevelOf, upgradePrice } from '../econ/economy';
import { HULL_INFO } from '../game/gridUtils';
import { shipThumbnail } from '../ui/shipArt';
import { TilePalette, PaletteSource, SheetButtonId } from '../builder/tilePalette';
import { idsForTab, sheetContent, SheetContent } from '../builder/paletteLogic';
import { fmtBig } from '../ui/format';
import { CreditsBadge } from '../ui/hud';
import { THEME } from '../ui/theme';
import { blockLockReason } from '../econ/progress';

type Section = 'blocks' | 'hulls';

const LIST_TOP = 164;
const LIST_BOTTOM = LAYOUT.tabs.y;
const ROW_H = 84;
const ROW_GAP = 6;
const ROW_X = 8;
const ROW_W = VIEW_W - 16;

/** The Shop's tile palette sits where the old block rows were. */
const PALETTE_AREA: Rect = { x: 0, y: LIST_TOP, w: VIEW_W, h: LIST_BOTTOM - LIST_TOP };

interface ShopButton { kind: 'buy' | 'upgrade' | 'hull'; id: string; rect: Rect; enabled: boolean; label: string; /** Why it cannot be pressed (a directional unlock not reached). */ lock?: string }
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

  /** Chunk 16b-fix: the Blocks section is the shared tile palette (4 per row, tabs, info sheet); only Hulls keep rows. */
  readonly palette = new TilePalette({ area: PALETTE_AREA, buttons: ['upgrade', 'buy'], tapAgain: 'close', panel: false });
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
    this.container.addChild(bg, this.listC, this.palette.container, this.mask, bar, this.inspector.container, title, this.credits.container);

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
        rows: this.rowsView(),
        tab: this.palette.tab,
        sheetOpen: this.palette.sheetOpen,
      }),
    };
  }

  // ------------------------------------------------------------------ list
  private inList(x: number, y: number) {
    return this.section === 'blocks' ? this.palette.inList(x, y) : y >= LIST_TOP && y < LIST_BOTTOM && x >= 0 && x < VIEW_W;
  }

  private screenRect(r: Rect): Rect {
    return { x: r.x, y: LIST_TOP + r.y - this.scrollY, w: r.w, h: r.h };
  }

  /**
   * Test view of the list: one entry per block (Blocks section) with its tile rect when the current tab shows it and its Buy /
   * Upgrade state (the button rects only for the selected block, whose sheet is open); or one entry per hull.
   */
  private rowsView() {
    if (this.section === 'hulls') {
      return this.rows.map(r => ({
        key: r.key,
        rect: this.screenRect(r.rect),
        buttons: r.buttons.map(b => ({ kind: b.kind, label: b.label, enabled: b.enabled, lock: b.lock ?? null, rect: this.screenRect(b.rect) })),
      }));
    }
    return this.blockKeys().map(key => {
      const c = this.blockContent(key);
      const open = this.palette.sheetOpen && this.palette.selected === key;
      // The sheet's buttons only exist (and have a rect) for the selected tile; the others report label and state with rect null.
      const rectOf = (k: 'buy' | 'upgrade') => (open ? this.palette.sheetButtonRect(k) : null);
      const buttons = c.lockText
        ? [{ kind: 'buy', label: c.lockText, enabled: false, lock: c.lockText, rect: rectOf('buy') }, { kind: 'upgrade', label: 'Locked', enabled: false, lock: c.lockText, rect: rectOf('upgrade') }]
        : [{ kind: 'buy', label: c.buy!.label, enabled: c.buy!.enabled, lock: null, rect: rectOf('buy') }, { kind: 'upgrade', label: c.upgrade!.label, enabled: c.upgrade!.enabled, lock: null, rect: rectOf('upgrade') }];
      return { key, rect: this.palette.tileScreenRect(key), buttons };
    });
  }

  private blockKeys(): string[] {
    // A block whose unlock is 'map' is not sold here (a later node map hands it out); today every block is 'shop'.
    return pickerBlocks().filter(b => b.unlock !== 'map').map(b => b.id);
  }

  private blockContent(id: string): SheetContent {
    const p = this.store.data;
    const level = p.levels[id] ?? 1;
    const owned = p.owned[id] ?? 0;
    return sheetContent({
      id, name: BLOCKS[id].name, desc: describeBlock(BLOCKS[id], level), owned, available: owned, level, maxLevel: maxLevelOf(id),
      credits: p.credits, copyPrice: copyPrice(id, owned), upgradePrice: upgradePrice(id, level),
      lock: blockLockReason(p, id, this.store.frontierReach),
    });
  }

  private paletteSource(): PaletteSource {
    const keys = new Set(this.blockKeys());
    return {
      ids: (tab) => idsForTab(tab, pickerBlocks()).filter(id => keys.has(id)),
      badge: (id) => this.store.data.owned[id] ?? 0,
      lock: (id) => blockLockReason(this.store.data, id, this.store.frontierReach),
      current: () => false,
      content: (id) => this.blockContent(id),
    };
  }

  private applyScroll() {
    if (this.section === 'blocks') return;
    const max = Math.max(0, this.contentH - (LIST_BOTTOM - LIST_TOP));
    this.scrollY = Math.max(0, Math.min(max, this.scrollY));
    this.listC.position.set(0, LIST_TOP - this.scrollY);
  }

  scrollBy(dy: number) {
    if (this.section === 'blocks') { this.palette.scrollBy(dy); this.scrollY = this.palette.scrollY; return; }
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
    if (s === 'blocks') {
      this.palette.attach(this.paletteSource(), {
        onSelect: (id) => this.showBlock(id),
        onButton: (id, kind) => this.pressBlock(id, kind),
        onClose: () => {},
        onMessage: (m) => this.toast.show(m),
      });
    } else this.palette.hide();
    this.rebuild();
  }

  private showBlock(id: string) {
    this.selected = id;
    const level = this.store.data.levels[id] ?? 1;
    this.inspector.set(`${BLOCKS[id].name} · Lv ${level}`, describeBlock(BLOCKS[id], level));
  }

  private pressBlock(id: string, kind: SheetButtonId) {
    if (kind === 'place') return;
    const c = this.blockContent(id);
    const btn = kind === 'buy' ? c.buy : c.upgrade;
    const before = this.store.data.credits;
    try {
      if (c.lockText) { this.toast.show(`Locked: ${c.lockText} on the Frontier`); return; }
      if (!btn?.enabled) {
        this.toast.show(kind === 'upgrade' && (this.store.data.levels[id] ?? 1) >= maxLevelOf(id) ? 'Already at max level' : 'Not enough credits');
        return;
      }
      if (kind === 'buy') {
        const r = this.store.buyCopy(id);
        this.toast.show(r.ok ? `Bought ${BLOCKS[id].name} for ${fmtBig(r.price)}` : r.error, 1600);
      } else {
        const r = this.store.buyUpgrade(id);
        if (r.ok) {
          this.model.refreshLevels();
          this.toast.show(`${BLOCKS[id].name} is now level ${this.store.data.levels[id]}`, 1600);
          this.showBlock(id);
        } else this.toast.show(r.error);
      }
    } finally { sfx.play(this.store.data.credits < before ? 'purchase' : 'denied'); }
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
    if (this.section === 'blocks') { this.palette.refresh(); this.contentH = 0; return; }
    const p = this.store.data;
    const keys = HULL_INFO.map(h => h.id);
    keys.forEach((key, i) => {
      const y = ROW_GAP + i * (ROW_H + ROW_GAP);
      const rect: Rect = { x: ROW_X, y, w: ROW_W, h: ROW_H };
      const buttons = [this.hullButton(key, y)];
      this.rows.push({ key, rect, buttons });
      const sel = this.selected === key;
      const g = new Graphics();
      g.rect(rect.x, rect.y, rect.w, rect.h).fill(THEME.panel).stroke({ color: sel ? THEME.select : THEME.border, width: sel ? THEME.selectWidth : 1.5 });
      this.listC.addChild(g);
      const info = HULL_INFO.find(h => h.id === key)!;
      this.drawHullMini(key, rect.x + 10, rect.y + 9);
      const owned = p.ownedHulls.includes(key);
      const name = makeText(info.name, 17, THEME.text, { fontWeight: 'bold' });
      name.position.set(rect.x + 88, rect.y + 12);
      const desc = makeText(owned ? 'Owned' : `Price ${fmtBig(HULL_PRICE[key] ?? 0)}`, 13, owned ? THEME.good : THEME.currency, { fontWeight: 'bold' });
      desc.position.set(rect.x + 88, rect.y + ROW_H - 28);
      this.listC.addChild(name, desc);
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
    if (this.section === 'blocks') {
      if (this.palette.tap(x, y)) this.selected = this.palette.selected;
      return;
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
    if (id === 'tabCaptain') { this.sm.switchTo(new CaptainScreen(this.sm)); return; }
    this.toast.show('Coming soon');
  }

  select(key: string) {
    if (this.section === 'blocks') { this.palette.select(key); this.showBlock(key); return; }
    this.selected = key;
    const h = HULL_INFO.find(hh => hh.id === key)!;
    this.inspector.set(h.name, h.desc);
    this.rebuild();
  }

  private press(b: ShopButton) {
    const before = this.store.data.credits;
    try { this.pressInner(b); } finally { sfx.play(this.store.data.credits < before ? 'purchase' : 'denied'); }
  }

  private pressInner(b: ShopButton) {
    if (!b.enabled) { this.toast.show('Not enough credits'); return; }
    const r = this.store.buyHull(b.id);
    if (r.ok) this.toast.show(`Bought the ${HULL_INFO.find(h => h.id === b.id)?.name ?? b.id} hull`, 1600);
    else this.toast.show(r.error);
  }
}
