import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { MapScreen } from './MapScreen';
import { CaptainScreen } from './CaptainScreen';
import { GestureTracker } from '../builder/gestures';
import { getBuilderModel } from '../builder/session';
import { LAYOUT, Rect, VIEW_H, VIEW_W } from '../builder/layout';
import { makeTabButtons } from '../builder/tabs';
import { sfx } from '../audio';
import { makeText, Toast } from '../builder/ui';
import { BLOCKS, pickerBlocks } from '../data/blocks';
import { describeBlock } from '../engine/compilerTypes';
import { copyPrice, maxLevelOf, upgradePrice } from '../econ/economy';
import { TilePalette, PaletteSource, SheetButtonId } from '../builder/tilePalette';
import { orderedBlockIds, sheetContent, SheetContent } from '../builder/paletteLogic';
import { fmtBig } from '../ui/format';
import { CreditsBadge } from '../ui/hud';
import { THEME } from '../ui/theme';
import { blockLockReason } from '../econ/progress';

/** The Shop's tile palette fills the space between the title bar and the tab bar (16e: no info line, no section buttons). */
const PALETTE_AREA: Rect = { x: 0, y: LAYOUT.top.h, w: VIEW_W, h: LAYOUT.tabs.y - LAYOUT.top.h };

/**
 * The Shop tab (chunk 16e: blocks only): one scrolling list of block tiles; tapping one opens its sheet with Upgrade and Buy.
 * Hulls are bought in the builder's hull picker.
 */
export class ShopScreen implements Screen {
  statsName = 'Shop';
  container = new Container();
  private model = getBuilderModel();
  private store = this.model.store;
  private credits = new CreditsBadge();
  private toast = new Toast();
  private tabs: ReturnType<typeof makeTabButtons> = [];
  private gestures: GestureTracker | null = null;
  private unsubscribe: (() => void) | null = null;

  readonly palette = new TilePalette({ area: PALETTE_AREA, buttons: ['upgrade', 'buy'], tapAgain: 'close', panel: false });
  selected: string | null = null;

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

    this.container.addChild(bg, this.palette.container, bar, title, this.credits.container);
    this.tabs = makeTabButtons('tabShop', (id) => this.tapTab(id));
    for (const b of this.tabs) this.container.addChild(b.container);
    this.container.addChild(this.toast.container);

    this.palette.attach(this.paletteSource(), {
      onSelect: (id) => { this.selected = id; },
      onButton: (id, kind) => this.pressBlock(id, kind),
      onMessage: (m) => this.toast.show(m),
    });
    this.installDevHook();
  }

  // ------------------------------------------------------------------ lifecycle
  init() {
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => this.tap(x, y),
        onDrag: (_dx, dy) => this.palette.scrollBy(-dy),
        onPinch: () => {},
        onWheel: (dy, x, y) => { if (this.palette.inList(x, y)) this.palette.scrollBy(dy); },
        canDrag: (x, y) => this.palette.inList(x, y),
      },
    );
    this.gestures.attach();
    this.unsubscribe = this.store.onChange(() => {
      this.credits.set(this.store.data.credits);
      this.palette.refresh();
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
        selected: this.palette.selected,
        scrollY: this.palette.scrollY,
        toast: this.toast.message,
        rows: this.rowsView(),
        sheetOpen: this.palette.sheetOpen,
        sheet: (() => {
          const c = this.palette.sheetContentNow;
          return c ? { title: c.title, level: c.levelLine, body: c.body, status: c.ownedLine, rect: this.palette.sheetRect } : null;
        })(),
      }),
    };
  }

  // ------------------------------------------------------------------ list
  /**
   * Test view of the list: one entry per block with its tile rect and its Buy / Upgrade state (the button rects only for the
   * selected block, whose sheet is open).
   */
  private rowsView() {
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
    const sold = new Set(pickerBlocks().filter(b => b.unlock !== 'map').map(b => b.id));
    return orderedBlockIds(pickerBlocks()).filter(id => sold.has(id));
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
    return {
      ids: () => this.blockKeys(),
      count: (id) => this.store.data.owned[id] ?? 0,
      owned: (id) => (this.store.data.owned[id] ?? 0) > 0,
      lock: (id) => blockLockReason(this.store.data, id, this.store.frontierReach),
      content: (id) => this.blockContent(id),
    };
  }

  scrollBy(dy: number) {
    this.palette.scrollBy(dy);
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
        } else this.toast.show(r.error);
      }
    } finally { sfx.play(this.store.data.credits < before ? 'purchase' : 'denied'); }
  }

  // ------------------------------------------------------------------ input
  private tap(x: number, y: number) {
    for (const b of this.tabs) {
      if (b.hit(x, y)) { b.flash(); b.spec.onTap(); return; }
    }
    this.palette.tap(x, y);
    this.selected = this.palette.selected;
  }

  private tapTab(id: string) {
    if (id === 'tabShop') return;
    if (id === 'tabBuild') { this.sm.switchTo(new BuildScreen(this.sm)); return; }
    if (id === 'tabMap') { this.sm.switchTo(new MapScreen(this.sm)); return; }
    if (id === 'tabCaptain') { this.sm.switchTo(new CaptainScreen(this.sm)); return; }
    this.toast.show('Coming soon');
  }

  /** Selects a block as a tap on its tile would (used by tests and scripts). */
  select(key: string) {
    this.palette.select(key);
    this.selected = key;
  }
}
