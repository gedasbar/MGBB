import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { ShopScreen } from './ShopScreen';
import { CaptainScreen } from './CaptainScreen';
import { WallScreen } from './WallScreen';
import { GestureTracker } from '../builder/gestures';
import { getBuilderModel } from '../builder/session';
import { inRect, LAYOUT, Rect, VIEW_H, VIEW_W } from '../builder/layout';
import { makeTabButtons } from '../builder/tabs';
import { makeText, Toast, UIButton } from '../builder/ui';
import { getProgressStore, isCleared, isFrontierUnlocked, isPassed, isUnlocked, nextTier } from '../econ/progress';
import { CreditsBadge, textButton, TextButton } from '../ui/hud';
import { FrontierScreen } from './FrontierScreen';
import { FRONTIER_NAME, MAP_UNLOCK_TIER } from '../frontier/constants';
import { fmtTime } from './RunSummaryScreen';
import { THEME } from '../ui/theme';
import { generateLevel, MAX_TIER } from '../wall/generator';

const MAP_COLS = 5;
const GRID_TOP = 52;
const SHEET_Y = 744;
const SHEET_H = LAYOUT.tabs.y - SHEET_Y;
const PAD = 10;
const GAP = 8;
const TILE = Math.floor((VIEW_W - 2 * PAD - (MAP_COLS - 1) * GAP) / MAP_COLS);
const STEP = TILE + GAP;
const ROWS = Math.ceil(MAX_TIER / MAP_COLS);

const FRAME = 0x55555a;
const FACE = 0x26262a;
const FRAME_LOCKED = 0x3d3d41;
const FACE_LOCKED = 0x1c1c1e;
const NUM_LOCKED = 0x5c5c61;

/** locked, open (not passed yet), passed (flown past the end, no Medal), cleared (every block destroyed, Medal). */
type TileState = 'locked' | 'open' | 'passed' | 'cleared';

/** Screen-independent description of a tile, also exposed to the e2e hook. */
export interface TileInfo { tier: number; state: TileState; spike: boolean; next: boolean }

/**
 * The campaign map: 100 square tiles in 5 columns, tier 1 at the top (the list reads left to right, top to bottom, and the
 * screen opens scrolled to the next tier to play). A bottom sheet tells about the selected tier and starts it.
 */
export class MapScreen implements Screen {
  statsName = 'Map';
  container = new Container();
  private store = getProgressStore();
  private credits = new CreditsBadge();
  private toast = new Toast();
  private listC = new Container();
  private mask = new Graphics();
  private sheet = new Container();
  private buttons: UIButton[] = [];
  private startButton: UIButton;
  private frontierButton: TextButton;
  private gestures: GestureTracker | null = null;
  private medalsText = makeText('', 22, THEME.text, { fontWeight: 'bold' });
  private title = makeText('', 20, THEME.text, { fontWeight: 'bold' });
  private hint = makeText('', 14, THEME.textDim, { wordWrap: true, wordWrapWidth: VIEW_W - 28, lineHeight: 17 });
  private spikeLine = makeText('', 15, THEME.bad, { fontWeight: 'bold' });
  private bestLine = makeText('', 16, THEME.textDim, { fontWeight: 'bold' });

  selected: number;
  scrollY = 0;

  constructor(private sm: ScreenManager, selectTier?: number) {
    const p = this.store.data;
    this.selected = Math.max(1, Math.min(MAX_TIER, selectTier ?? nextTier(p)));
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(THEME.bg);
    const bar = new Graphics()
      .rect(0, 0, VIEW_W, GRID_TOP).fill(THEME.panel).rect(0, GRID_TOP - 1, VIEW_W, 1).fill(THEME.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(THEME.panel)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(THEME.border);
    this.mask.rect(0, GRID_TOP, VIEW_W, SHEET_Y - GRID_TOP).fill(0xffffff);
    this.listC.mask = this.mask;

    this.credits.set(p.credits);
    this.medalsText.anchor.set(0, 0.5);
    this.medalsText.position.set(64, 27);

    const back = textButton('mapBack', { x: 6, y: 6, w: 46, h: 40 }, '<', () => this.sm.switchTo(new BuildScreen(this.sm)), 24);
    this.buttons.push(back);
    // Chunk 15a: the Frontier grid map opens here once tier MAP_UNLOCK_TIER is passed (greyed until then).
    const open = isFrontierUnlocked(p);
    this.frontierButton = textButton('mapFrontier', { x: 196, y: 6, w: 150, h: 40 }, open ? FRONTIER_NAME : `${FRONTIER_NAME}\nPass tier ${MAP_UNLOCK_TIER}`, () => this.openFrontier(), open ? 18 : 13);
    this.frontierButton.setEnabled(open);
    this.buttons.push(this.frontierButton);

    const sheetBg = new Graphics().rect(0, SHEET_Y, VIEW_W, SHEET_H).fill(THEME.panel).rect(0, SHEET_Y, VIEW_W, 1).fill(THEME.border);
    this.title.position.set(14, SHEET_Y + 10);
    this.hint.position.set(14, SHEET_Y + 40);
    this.spikeLine.position.set(14, SHEET_Y + 96);
    this.bestLine.position.set(14, SHEET_Y + 124);
    this.startButton = textButton('mapStart', { x: VIEW_W - 14 - 150, y: SHEET_Y + SHEET_H - 14 - 56, w: 150, h: 56 }, 'START', () => this.start(), 24);
    this.buttons.push(this.startButton);
    this.sheet.addChild(sheetBg, this.title, this.hint, this.spikeLine, this.bestLine, this.startButton.container);

    const tabs = makeTabButtons('tabMap', (id) => this.tapTab(id));
    this.buttons.push(...tabs);
    this.container.addChild(bg, this.listC, this.mask, bar, this.medalsText, this.credits.container, back.container, this.frontierButton.container, this.sheet);
    for (const t of tabs) this.container.addChild(t.container);
    this.toast.container.y = -80; // the toast's usual spot is behind the bottom sheet here
    this.container.addChild(this.toast.container);

    const maxScroll = this.maxScroll();
    this.scrollY = Math.max(0, Math.min(maxScroll, this.tileY(this.selected) - 120));
    this.rebuild();
    this.installDevHook();
  }

  // ------------------------------------------------------------------ data
  tileInfo(tier: number): TileInfo {
    const p = this.store.data;
    const state: TileState = isCleared(p, tier) ? 'cleared' : isPassed(p, tier) ? 'passed' : isUnlocked(p, tier) ? 'open' : 'locked';
    return { tier, state, spike: !!generateLevel(tier).spike, next: tier === nextTier(p) && !isPassed(p, tier) };
  }

  private tileY(tier: number): number { return PAD + Math.floor((tier - 1) / MAP_COLS) * STEP; }
  private tileX(tier: number): number { return PAD + ((tier - 1) % MAP_COLS) * STEP; }
  private maxScroll(): number { return Math.max(0, PAD + ROWS * STEP - (SHEET_Y - GRID_TOP)); }

  /** Screen rectangle of a tile (game coordinates), for taps and tests. */
  tileScreenRect(tier: number): Rect {
    return { x: this.tileX(tier), y: GRID_TOP + this.tileY(tier) - this.scrollY, w: TILE, h: TILE };
  }

  // ------------------------------------------------------------------ drawing
  private rebuild() {
    for (const ch of this.listC.removeChildren()) ch.destroy({ children: true });
    const g = new Graphics();
    this.listC.addChild(g);
    for (let tier = 1; tier <= MAX_TIER; tier++) {
      const info = this.tileInfo(tier);
      const x = this.tileX(tier);
      const y = this.tileY(tier);
      const locked = info.state === 'locked';
      const sel = tier === this.selected;
      g.rect(x, y, TILE, TILE).fill(locked ? FRAME_LOCKED : FRAME);
      g.rect(x + 3, y + 3, TILE - 6, TILE - 6).fill(locked ? FACE_LOCKED : sel ? 0x3a3a3e : FACE);
      if (info.spike) g.poly([x + 3, y + 3, x + 27, y + 3, x + 3, y + 27]).fill(THEME.bad);
      if (info.state === 'cleared') g.circle(x + TILE - 15, y + 15, 7).fill(THEME.currency);
      else if (info.state === 'passed') g.circle(x + TILE - 15, y + 15, 6).stroke({ color: THEME.currency, width: 2 });
      if (sel) g.rect(x - 1, y - 1, TILE + 2, TILE + 2).stroke({ color: THEME.select, width: 3 });
      else if (info.next) g.rect(x, y, TILE, TILE).stroke({ color: THEME.select, width: 1.5 });
      const n = makeText(String(tier), 28, locked ? NUM_LOCKED : THEME.text, { fontWeight: 'bold' });
      n.anchor.set(0.5);
      n.position.set(x + TILE / 2, y + TILE / 2 + 2);
      this.listC.addChild(n);
    }
    this.applyScroll();
    this.updateSheet();
    const p = this.store.data;
    this.medalsText.text = `Medals ${p.medals}`;
    this.credits.set(p.credits);
  }

  private applyScroll() {
    this.scrollY = Math.max(0, Math.min(this.maxScroll(), this.scrollY));
    this.listC.position.set(0, GRID_TOP - this.scrollY);
  }

  private updateSheet() {
    const p = this.store.data;
    const level = generateLevel(this.selected);
    const info = this.tileInfo(this.selected);
    this.title.text = `Tier ${this.selected} · ${level.name}`;
    this.hint.text = level.hint ?? '';
    this.spikeLine.text = level.spike ? 'SPIKE: every block has 1.6x HP' : '';
    const key = String(this.selected);
    const pct = p.wallBestPct[key];
    const passTime = p.wallBestTime[key];
    const clearTime = p.wallBestClearTime[key] ?? passTime;
    const destroyed = pct !== undefined ? `Best destroyed ${pct}%` : '';
    const result = info.state === 'cleared' ? `Cleared ${clearTime !== undefined ? fmtTime(clearTime) : ''}`
      : info.state === 'passed' ? `Passed ${passTime !== undefined ? fmtTime(passTime) : ''}` : 'Not passed';
    this.bestLine.text = destroyed ? `${destroyed}  ·  ${result}` : result;
    const open = info.state !== 'locked';
    this.startButton.setEnabled(open);
    this.startButton.container.children.forEach(c => { if ((c as any).text !== undefined) (c as any).text = open ? 'START' : 'Locked'; });
  }

  // ------------------------------------------------------------------ input
  init() {
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => this.tap(x, y),
        onDrag: (_dx, dy) => this.scrollBy(-dy),
        onPinch: () => {},
        onWheel: (dy, x, y) => { if (this.inGrid(x, y)) this.scrollBy(dy); },
        canDrag: (x, y) => this.inGrid(x, y),
      },
    );
    this.gestures.attach();
  }

  private inGrid(x: number, y: number) { return y >= GRID_TOP && y < SHEET_Y && x >= 0 && x < VIEW_W; }

  scrollBy(dy: number) {
    this.scrollY += dy;
    this.applyScroll();
  }

  private tap(x: number, y: number) {
    const b = this.buttons.find(bb => bb.hit(x, y));
    if (b) {
      if (b.enabled) { b.flash(); b.spec.onTap(); }
      else if (b === this.startButton) this.toast.show(`Pass tier ${this.selected - 1} first`);
      else if (b === this.frontierButton) this.toast.show(`The ${FRONTIER_NAME} opens after you pass tier ${MAP_UNLOCK_TIER}`);
      return;
    }
    if (!this.inGrid(x, y)) return;
    for (let tier = 1; tier <= MAX_TIER; tier++) {
      if (inRect(this.tileScreenRect(tier), x, y)) { this.select(tier); return; }
    }
  }

  select(tier: number) {
    this.selected = tier;
    this.rebuild();
  }

  private tapTab(id: string) {
    if (id === 'tabMap') return;
    if (id === 'tabBuild') this.sm.switchTo(new BuildScreen(this.sm));
    else if (id === 'tabShop') this.sm.switchTo(new ShopScreen(this.sm));
    else if (id === 'tabCaptain') this.sm.switchTo(new CaptainScreen(this.sm));
    else this.toast.show('Coming soon');
  }

  private start() {
    if (!isUnlocked(this.store.data, this.selected)) return;
    const model = getBuilderModel();
    if (model.compiled.recipes.length === 0) {
      this.toast.show("Your circuit doesn't reach an ejector");
      return;
    }
    this.sm.switchTo(new WallScreen(this.sm, generateLevel(this.selected), model.gridForFlight()));
  }

  openFrontier() {
    if (!isFrontierUnlocked(this.store.data)) return;
    this.sm.switchTo(new FrontierScreen(this.sm));
  }

  update(dt: number) {
    this.toast.update(dt * 1000);
  }

  destroy() {
    this.gestures?.detach();
    this.container.destroy({ children: true });
  }

  private installDevHook() {
    if (!import.meta.env.DEV) return;
    (window as any).__mgbm = {
      screen: 'map',
      state: () => ({
        selected: this.selected, scrollY: this.scrollY, medals: this.store.data.medals, credits: this.store.data.credits,
        medalsText: this.medalsText.text,
        tiles: Array.from({ length: MAX_TIER }, (_, i) => this.tileInfo(i + 1)),
        sheet: { title: this.title.text, hint: this.hint.text, spike: this.spikeLine.text, best: this.bestLine.text, startLabel: this.startLabel(), startEnabled: this.startButton.enabled },
        toast: this.toast.message,
      }),
      tileScreenRect: (tier: number) => this.tileScreenRect(tier),
      scrollTo: (y: number) => { this.scrollY = y; this.applyScroll(); this.rebuild(); },
      frontierButton: () => ({ rect: this.frontierButton.rect, enabled: this.frontierButton.enabled }),
      openFrontier: () => this.openFrontier(),
      progress: this.store,
    };
  }

  private startLabel(): string {
    for (const c of this.startButton.container.children) if ((c as any).text !== undefined) return (c as any).text;
    return '';
  }
}
