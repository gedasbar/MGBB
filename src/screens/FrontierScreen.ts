import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { ShopScreen } from './ShopScreen';
import { CaptainScreen } from './CaptainScreen';
import { MapScreen } from './MapScreen';
import { WallScreen } from './WallScreen';
import { FlyScreen } from './FlyScreen';
import { GestureTracker } from '../builder/gestures';
import { getBuilderModel } from '../builder/session';
import { inRect, LAYOUT, Rect, VIEW_W } from '../builder/layout';
import { makeTabButtons } from '../builder/tabs';
import { makeText, Toast, UIButton } from '../builder/ui';
import { getProgressStore, isFrontierUnlocked } from '../econ/progress';
import { CreditsBadge, textButton, TextButton } from '../ui/hud';
import { fmtBig } from '../ui/format';
import { CATEGORY_COLOR, THEME } from '../ui/theme';
import { BLOCKS } from '../data/blocks';
import type { StatsInfo } from '../ui/stats';
import {
  FAR_ZOOM, FREEFLY_SQUARE_SECONDS, FRONTIER_NAME, MAP_UNLOCK_TIER, MEDAL_DOT_ZOOM, PROGRESS_COLOR, TILE_STYLE, TileStyle,
  WHEEL_ZOOM_RATE, ZOOM_MAX, ZOOM_MIN,
} from '../frontier/constants';
import { frontierLevel, isSpikeSquare, squareKind, squareLevel } from '../frontier/level';
import { tileLook } from '../frontier/look';
import { blockName, UNLOCK_RINGS, UNLOCK_SECTORS, UNLOCKS, unlocksOnSquare } from '../frontier/unlocks';
import { frontierSession, frontierJump, selectionAfterTap } from '../frontier/session';
import {
  canPlay, frontierCounts, frontierSquare, medalShown, nearestMedalSquare, SquareState, squareState,
} from '../frontier/state';
import { getWorld, parseKey, sector, SECTOR_NAME, sqKey } from '../frontier/world';
import { clearFrontierRing, clearFrontierSquare, unlockFrontier } from '../debug/cheats';

const TOP = 52;
const PANEL_Y = 704;
const TABS_Y = LAYOUT.tabs.y;
/** The map's screen rectangle (between the top bar and the panel). */
const FRONTIER_MAP: Rect = { x: 0, y: TOP, w: VIEW_W, h: PANEL_Y - TOP };
const MCX = FRONTIER_MAP.x + FRONTIER_MAP.w / 2;
const MCY = FRONTIER_MAP.y + FRONTIER_MAP.h / 2;

/** Panel text while nothing is selected. */
const NO_SELECTION_HINT = 'Select a square';
const STATE_LABEL: Record<SquareState, string> = { hole: 'Empty space', locked: 'Locked', available: 'Available', passed: 'Passed', cleared: 'Cleared' };
/** Panel state text: progress states in the one progress colour (chunk 15b: no green). */
const STATE_COLOR: Record<SquareState, number> = { hole: THEME.textDim, locked: THEME.textDim, available: THEME.text, passed: PROGRESS_COLOR, cleared: PROGRESS_COLOR };
/** Threshold rings: thin, dim. */
const RING_LINE = 0x8a8a90;
const RING_ALPHA = 0.35;

interface SquareView { frame: Sprite; mid: Sprite; inner: Sprite; medal: Sprite; spike: Sprite }

function sprite(tex: Texture = Texture.WHITE): Sprite {
  const s = new Sprite(tex);
  s.visible = false;
  return s;
}

/**
 * The Frontier grid map (chunk 15a): an infinite plane of squares, each a wall level. Drag pans, wheel and pinch zoom,
 * a tap selects a square and the panel below plays it. Only squares in view are drawn, from a pool of sprites that
 * only grows.
 */
export class FrontierScreen implements Screen {
  statsName = 'Frontier';
  container = new Container();
  private store = getProgressStore();
  private toast = new Toast();
  private credits = new CreditsBadge();
  private tiles = new Container();
  private selG = new Graphics();
  private views: SquareView[] = [];
  private triTex: Texture;
  private dotTex: Texture;
  private ringG = new Graphics();
  /** The Unlocks panel (a modal over the map). */
  private unlocksC = new Container();
  unlocksOpen = false;
  private buttons: UIButton[] = [];
  private playButton: TextButton;
  private gestures: GestureTracker | null = null;
  private dirty = true;
  private lastViews = 0;
  /** TILE_STYLE, switchable by the dev hook for the comparison sheet. */
  tileStyle: TileStyle = TILE_STYLE;
  /** Explored box (stored squares and the origin, plus one): squares outside it are locked or holes, no lookups needed. */
  private box = { x0: -1, y0: -1, x1: 1, y1: 1 };
  private unsub: (() => void) | null = null;

  private title = makeText(FRONTIER_NAME, 22, THEME.text, { fontWeight: 'bold' });
  private medalsText = makeText('', 16, THEME.currency, { fontWeight: 'bold' });
  private line1 = makeText('', 20, THEME.text, { fontWeight: 'bold' });
  private line2 = makeText('', 16, THEME.textDim, { fontWeight: 'bold' });
  private stateText = makeText('', 16, THEME.text, { fontWeight: 'bold' });
  private medalText = makeText('', 16, THEME.currency, { fontWeight: 'bold' });
  private spikeText = makeText('', 15, THEME.bad, { fontWeight: 'bold' });
  private countText = makeText('', 14, THEME.textDim, { fontWeight: 'bold' });
  /** Chunk 19a: best credits earned in one run of the selected square, after the state and Medal text on the state row; empty when never played. */
  private earnText = makeText('', 14, THEME.currency, { fontWeight: 'bold' });

  /** Drawn last frame, for the stats overlay and the e2e hook. */
  drawnSquares = 0;
  spritesUsed = 0;

  constructor(private sm: ScreenManager) {
    const bg = new Graphics().rect(0, 0, VIEW_W, CONFIG.VIEW.H).fill(THEME.bg);
    const chrome = new Graphics()
      .rect(0, 0, VIEW_W, TOP).fill(THEME.panel).rect(0, TOP - 1, VIEW_W, 1).fill(THEME.border)
      .rect(0, PANEL_Y, VIEW_W, TABS_Y - PANEL_Y).fill(THEME.panel).rect(0, PANEL_Y, VIEW_W, 1).fill(THEME.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(THEME.panel)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(THEME.border);
    // The spike mark is a corner triangle (as on the campaign map): one shared texture, tinted.
    this.triTex = sm.app.renderer.generateTexture(new Graphics().poly([0, 0, 32, 0, 0, 32]).fill(0xffffff));
    // Free Fly squares carry a round inner dot instead of the square one.
    this.dotTex = sm.app.renderer.generateTexture(new Graphics().circle(32, 32, 32).fill(0xffffff));

    this.title.anchor.set(0, 0.5);
    this.title.position.set(64, 27);
    this.medalsText.anchor.set(0, 0.5);
    this.medalsText.position.set(64 + this.title.width + 16, 28);

    const back = textButton('frontierBack', { x: 6, y: 6, w: 46, h: 40 }, '<', () => this.sm.switchTo(new MapScreen(this.sm)), 24);
    const bw = Math.floor((VIEW_W - 5 * 8) / 4);
    const by = PANEL_Y + 10;
    const bx = (i: number) => 8 + i * (bw + 8);
    const recenter = textButton('frontierRecenter', { x: bx(0), y: by, w: bw, h: 44 }, 'Recenter', () => this.goTo(0, 0), 15);
    const medal = textButton('frontierMedal', { x: bx(1), y: by, w: bw, h: 44 }, 'Nearest medal', () => this.goMedal(), 15);
    const edge = textButton('frontierEdge', { x: bx(2), y: by, w: bw, h: 44 }, FRONTIER_NAME, () => this.goEdge(), 15);
    const unlocks = textButton('frontierUnlocks', { x: bx(3), y: by, w: bw, h: 44 }, 'Unlocks', () => this.openUnlocks(), 15);
    this.playButton = textButton('frontierPlay', { x: VIEW_W - 14 - 150, y: TABS_Y - 12 - 56, w: 150, h: 56 }, 'PLAY', () => this.play(), 24);
    const tabs = makeTabButtons('tabMap', (id) => this.tapTab(id));
    this.buttons.push(back, recenter, medal, edge, unlocks, this.playButton, ...tabs);

    const lx = 14;
    this.line1.position.set(lx, PANEL_Y + 64);
    this.line2.position.set(lx, PANEL_Y + 94);
    this.stateText.position.set(lx, PANEL_Y + 120);
    this.medalText.position.set(lx, PANEL_Y + 120);
    this.spikeText.position.set(lx, PANEL_Y + 146);
    this.countText.position.set(lx, PANEL_Y + 172);
    this.earnText.position.set(lx, PANEL_Y + 123);

    this.container.addChild(bg, this.tiles, this.ringG, this.selG, chrome, this.title, this.medalsText, this.credits.container,
      this.line1, this.line2, this.stateText, this.medalText, this.spikeText, this.countText, this.earnText);
    for (const b of this.buttons) this.container.addChild(b.container);
    this.unlocksC.visible = false;
    this.container.addChild(this.unlocksC);
    this.toast.container.y = -150; // above the panel
    this.container.addChild(this.toast.container);

    this.unsub = this.store.onChange(() => { this.refreshBox(); this.dirty = true; });
    frontierSession.onChange = () => {
      this.clampZoom();
      const sel = frontierSession.sel;
      if (sel && this.stateAt(sel.x, sel.y) === 'hole') frontierSession.sel = null; // a dev jump onto a hole selects nothing
      this.dirty = true;
      this.updatePanel();
    };
    this.refreshBox();
    this.installDevHook();
  }

  private get f() { return this.store.data.frontier; }
  private get world() { return getWorld(this.f.seed); }
  get zoom() { return frontierSession.zoom; }

  // ------------------------------------------------------------------ state
  private refreshBox() {
    const b = { x0: 0, y0: 0, x1: 0, y1: 0 };
    for (const k of Object.keys(this.f.sq)) {
      const p = parseKey(k);
      if (!p) continue;
      if (p.x < b.x0) b.x0 = p.x; if (p.x > b.x1) b.x1 = p.x;
      if (p.y < b.y0) b.y0 = p.y; if (p.y > b.y1) b.y1 = p.y;
    }
    this.box = { x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1 };
  }

  /** squareState with a shortcut: outside the explored box nothing is open yet. */
  stateAt(x: number, y: number): SquareState {
    const b = this.box;
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return this.world.isHole(x, y) ? 'hole' : 'locked';
    return squareState(this.f, x, y);
  }

  // ------------------------------------------------------------------ camera
  /** Screen centre of a square. */
  squareScreen(x: number, y: number): { x: number; y: number } {
    const s = frontierSession;
    return { x: MCX + (x - s.cx) * s.zoom, y: MCY + (y - s.cy) * s.zoom };
  }

  /** Square under a screen point. */
  squareAt(px: number, py: number): { x: number; y: number } {
    const s = frontierSession;
    return { x: Math.round(s.cx + (px - MCX) / s.zoom), y: Math.round(s.cy + (py - MCY) / s.zoom) };
  }

  pan(dx: number, dy: number) {
    frontierSession.cx -= dx / this.zoom;
    frontierSession.cy -= dy / this.zoom;
    this.dirty = true;
  }

  zoomAt(factor: number, px: number, py: number) {
    const s = frontierSession;
    const wx = s.cx + (px - MCX) / s.zoom;
    const wy = s.cy + (py - MCY) / s.zoom;
    s.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s.zoom * factor));
    s.cx = wx - (px - MCX) / s.zoom;
    s.cy = wy - (py - MCY) / s.zoom;
    this.dirty = true;
  }

  private clampZoom() { frontierSession.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, frontierSession.zoom)); }

  goTo(x: number, y: number) {
    frontierJump(x, y);
    this.updatePanel();
  }

  private goMedal() {
    const s = frontierSession;
    const m = nearestMedalSquare(this.f, { x: Math.round(s.cx), y: Math.round(s.cy) });
    if (!m) { this.toast.show('No medal square is available right now'); return; }
    this.goTo(m.x, m.y);
  }

  private goEdge() {
    const e = frontierSquare(this.f);
    if (e) this.goTo(e.x, e.y);
  }

  // ------------------------------------------------------------------ drawing
  private redraw() {
    const s = frontierSession;
    const z = s.zoom;
    const far = z < FAR_ZOOM;
    const halfW = FRONTIER_MAP.w / 2 / z;
    const halfH = FRONTIER_MAP.h / 2 / z;
    const x0 = Math.floor(s.cx - halfW - 0.5);
    const x1 = Math.ceil(s.cx + halfW + 0.5);
    const y0 = Math.floor(s.cy - halfH - 0.5);
    const y1 = Math.ceil(s.cy + halfH + 0.5);
    const gap = far ? (z >= 6 ? 1 : 0) : Math.max(2, Math.round(z * 0.08));
    const size = z - gap;
    const seed = this.f.seed;
    const world = this.world;
    const showMedal = !far || z >= MEDAL_DOT_ZOOM;
    let vi = 0;
    let drawn = 0;
    let used = 0;
    for (let y = y0; y <= y1; y++) {
      const sy = MCY + (y - s.cy) * z - size / 2;
      if (sy + size < FRONTIER_MAP.y || sy > FRONTIER_MAP.y + FRONTIER_MAP.h) continue;
      for (let x = x0; x <= x1; x++) {
        const st = this.stateAt(x, y);
        if (st === 'hole') continue;
        const sx = MCX + (x - s.cx) * z - size / 2;
        if (sx + size < 0 || sx > VIEW_W) continue;
        const v = this.view(vi++);
        drawn++;
        const medal = showMedal && st !== 'cleared' && world.hasMedal(x, y);
        const locked = st === 'locked';
        const kind = squareKind(x, y, seed);
        const look = tileLook(st, kind, this.tileStyle, far);
        // The outer sprite: the plate itself, or the lavender outline (passed) around the plate.
        v.spike.visible = false;
        if (look.edge === null) {
          place(v.frame, sx, sy, size, look.plate);
          v.mid.visible = false;
          used++;
        } else {
          const w = far ? Math.max(1, Math.round(size * 0.2)) : Math.max(2, Math.round(size * 0.08));
          place(v.frame, sx, sy, size, look.edge);
          place(v.mid, sx + w, sy + w, size - 2 * w, look.plate);
          used += 2;
        }
        if (look.inner) {
          const m2 = Math.round(size * (look.inner.shape === 'dot' ? 0.36 : 0.27));
          v.inner.texture = look.inner.shape === 'square' ? Texture.WHITE : this.dotTex;
          place(v.inner, sx + m2, sy + m2, size - 2 * m2, look.inner.color);
          used++;
        } else v.inner.visible = false;
        if (!far && isSpikeSquare(x, y, seed)) {
          const m1 = Math.max(2, Math.round(size * 0.08));
          place(v.spike, sx + m1, sy + m1, size * 0.3, THEME.bad);
          v.spike.alpha = locked ? 0.5 : 1;
          used++;
        }
        if (medal) {
          const ms = Math.max(2, Math.round(size * (far ? 0.5 : 0.24)));
          place(v.medal, sx + (size - ms) / 2, sy + (size - ms) / 2, ms, THEME.currency);
          v.medal.alpha = st === 'locked' ? 0.55 : 1;
          used++;
        } else v.medal.visible = false;
      }
    }
    // Views are used from the front of the pool: hide the ones the last frame used and this one did not.
    for (let i = vi; i < this.lastViews; i++) {
      const v = this.views[i];
      v.frame.visible = v.mid.visible = v.inner.visible = v.medal.visible = v.spike.visible = false;
    }
    this.lastViews = vi;
    this.drawnSquares = drawn;
    this.spritesUsed = used;
    this.drawRings(size);
    // Selection outline.
    this.selG.clear();
    const sel = s.sel ? this.squareScreen(s.sel.x, s.sel.y) : null;
    if (sel && inRect(FRONTIER_MAP, sel.x, sel.y)) {
      const r = size / 2 + Math.max(2, z * 0.06);
      this.selG.rect(sel.x - r, sel.y - r, 2 * r, 2 * r).stroke({ color: THEME.select, width: far ? 2 : 3 });
    }
  }

  /** Threshold rings: a thin dim square at the inner edge of each unlock ring, only when one of its sides is in view. */
  private drawRings(size: number) {
    const s = frontierSession;
    const g = this.ringG.clear();
    const m = FRONTIER_MAP;
    const half = size / 2 + (s.zoom - size) / 2; // half a square, gap included
    let any = false;
    for (const R of UNLOCK_RINGS) {
      const a = this.squareScreen(-R, -R);
      const b = this.squareScreen(R, R);
      const x0 = a.x - half, y0 = a.y - half, x1 = b.x + half, y1 = b.y + half;
      // Inner edge of ring R = outer edge of ring R-1: move in by one square.
      const k = s.zoom;
      const X0 = x0 + k, Y0 = y0 + k, X1 = x1 - k, Y1 = y1 - k;
      const inX = (x: number) => x >= m.x && x <= m.x + m.w;
      const inY = (y: number) => y >= m.y && y <= m.y + m.h;
      const spanX = X1 >= m.x && X0 <= m.x + m.w;
      const spanY = Y1 >= m.y && Y0 <= m.y + m.h;
      const visible = (spanX && (inY(Y0) || inY(Y1))) || (spanY && (inX(X0) || inX(X1)));
      if (!visible) continue;
      g.rect(X0, Y0, X1 - X0, Y1 - Y0);
      any = true;
    }
    if (any) g.stroke({ color: RING_LINE, width: 1.5, alpha: RING_ALPHA });
  }

  private view(i: number): SquareView {
    let v = this.views[i];
    if (!v) {
      v = { frame: sprite(), mid: sprite(), inner: sprite(), medal: sprite(), spike: sprite(this.triTex) };
      this.tiles.addChild(v.frame, v.mid, v.inner, v.spike, v.medal);
      this.views.push(v);
    }
    return v;
  }

  // ------------------------------------------------------------------ panel
  private updatePanel() {
    const sel = frontierSession.sel;
    if (!sel) { this.showNoSelection(); return; }
    const { x, y } = sel;
    const st = this.stateAt(x, y);
    const p = this.store.data;
    this.credits.set(p.credits);
    const counts = frontierCounts(this.f);
    this.medalsText.text = `Medals ${fmtBig(p.medals)}`;
    this.countText.text = `${fmtBig(counts.cleared)} cleared · ${fmtBig(counts.passed - counts.cleared)} passed`;
    const kind = squareKind(x, y, this.f.seed);
    this.line1.text = `(${fmtBig(x)}, ${fmtBig(y)})` + (kind === 'freefly' ? `  ·  Free Fly, survive ${FREEFLY_SQUARE_SECONDS} s` : kind === 'wall' ? '  ·  Wall' : '');
    {
      const lv = squareLevel(x, y, this.f.seed);
      this.line2.text = `Ring ${fmtBig(lv.ring)}  ·  ${SECTOR_NAME[sector(x, y)]}  ·  Tier ${fmtBig(lv.tier)}`;
      this.stateText.text = STATE_LABEL[st];
      this.medalText.text = medalShown(this.f, x, y) ? '·  Medal on first clear' : '';
      this.medalText.x = this.stateText.x + this.stateText.width + 10;
      this.spikeText.text = lv.spike ? (kind === 'freefly' ? 'SPIKE: every enemy has 1.6x HP' : 'SPIKE: every block has 1.6x HP') : '';
    }
    // A square on a threshold ring names its unlock (in place of the counts line).
    const us = unlocksOnSquare(x, y);
    if (us.length) {
      const u = us[0];
      const got = this.store.frontierReach[u.sector] >= u.ring;
      this.countText.text = `Ring ${u.ring} ${SECTOR_NAME[u.sector]} unlocks ${us.map(e => blockName(e.blockId)).join(' and ')}${got ? ' (reached)' : ''}`;
      this.countText.style.fill = PROGRESS_COLOR;
    } else this.countText.style.fill = THEME.textDim;
    this.stateText.style.fill = STATE_COLOR[st];
    const earned = p.squareBestCredits[sqKey(x, y)];
    this.earnText.text = earned !== undefined ? `·  Best earned ${fmtBig(earned)}` : '';
    this.earnText.x = (this.medalText.text ? this.medalText.x + this.medalText.width : this.stateText.x + this.stateText.width) + 10;
    const ok = canPlay(this.f, x, y);
    this.playButton.setEnabled(ok);
    this.playButton.setText(st === 'passed' || st === 'cleared' ? 'REPLAY' : 'PLAY');
  }

  /** Nothing selected (a tap on empty space): a neutral hint, no Play, no unlock line. */
  private showNoSelection() {
    const p = this.store.data;
    this.credits.set(p.credits);
    const counts = frontierCounts(this.f);
    this.medalsText.text = `Medals ${fmtBig(p.medals)}`;
    this.countText.text = `${fmtBig(counts.cleared)} cleared · ${fmtBig(counts.passed - counts.cleared)} passed`;
    this.countText.style.fill = THEME.textDim;
    this.line1.text = NO_SELECTION_HINT;
    this.line2.text = '';
    this.stateText.text = '';
    this.medalText.text = '';
    this.earnText.text = '';
    this.spikeText.text = '';
    this.playButton.setEnabled(false);
    this.playButton.setText('PLAY');
  }

  /** Why the selected square cannot be played (empty when it can). */
  private playBlocked(): string {
    const sel = frontierSession.sel;
    if (!sel) return NO_SELECTION_HINT;
    const st = this.stateAt(sel.x, sel.y);
    if (st === 'locked') return 'Locked: pass or clear a square next to it first';
    return '';
  }

  // ------------------------------------------------------------------ input
  init() {
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => { if (!this.sm.overlays?.blocking) this.tap(x, y); },
        onDrag: (dx, dy) => this.pan(dx, dy),
        onPinch: (f, cx, cy) => this.zoomAt(f, cx, cy),
        onWheel: (dy, x, y) => { if (inRect(FRONTIER_MAP, x, y)) this.zoomAt(Math.exp(-dy * WHEEL_ZOOM_RATE), x, y); },
        canDrag: (x, y) => !this.sm.overlays?.blocking && inRect(FRONTIER_MAP, x, y),
      },
    );
    this.gestures.attach();
    this.updatePanel();
  }

  tap(x: number, y: number) {
    if (this.unlocksOpen) { this.closeUnlocks(); return; } // any tap closes the Unlocks panel
    const b = this.buttons.find(bb => bb.hit(x, y));
    if (b) {
      if (b.enabled) { b.flash(); b.spec.onTap(); }
      else if (b === this.playButton) this.toast.show(this.playBlocked());
      return;
    }
    if (!inRect(FRONTIER_MAP, x, y)) return;
    const sq = this.squareAt(x, y);
    this.select(sq.x, sq.y);
  }

  /** Selects a square; a hole (empty space) cannot be selected, it clears the selection instead. */
  select(x: number, y: number) {
    frontierSession.sel = selectionAfterTap(this.stateAt(x, y) === 'hole', x, y);
    this.dirty = true;
    this.updatePanel();
  }

  private tapTab(id: string) {
    if (id === 'tabMap') { this.sm.switchTo(new MapScreen(this.sm)); return; }
    if (id === 'tabBuild') this.sm.switchTo(new BuildScreen(this.sm));
    else if (id === 'tabShop') this.sm.switchTo(new ShopScreen(this.sm));
    else if (id === 'tabCaptain') this.sm.switchTo(new CaptainScreen(this.sm));
    else this.toast.show('Coming soon');
  }

  play() {
    const sel = frontierSession.sel;
    if (!sel) return;
    const { x, y } = sel;
    if (!canPlay(this.f, x, y)) return;
    const model = getBuilderModel();
    if (model.compiled.recipes.length === 0) { this.toast.show("Your circuit doesn't reach an ejector"); return; }
    const lv = squareLevel(x, y, this.f.seed);
    if (lv.fly) this.sm.switchTo(new FlyScreen(this.sm, model.gridForFlight(), { frontier: { x, y, params: lv.fly, spike: lv.spike, squareTier: lv.tier } }));
    else this.sm.switchTo(new WallScreen(this.sm, frontierLevel(lv), model.gridForFlight()));
  }

  // ------------------------------------------------------------------ unlocks panel
  /** Lists the 28 directional unlocks (direction, ring, block, reached; the legendary blocks in their colour) and the furthest ring in each direction, four quadrants. */
  openUnlocks() {
    for (const ch of this.unlocksC.removeChildren()) ch.destroy({ children: true });
    const m = FRONTIER_MAP;
    const reach = this.store.frontierReach;
    const g = new Graphics().rect(m.x, m.y, m.w, m.h).fill({ color: THEME.bg, alpha: 0.96 }).rect(m.x + 10, m.y + 10, m.w - 20, m.h - 20).stroke({ color: THEME.border, width: 1.5 });
    this.unlocksC.addChild(g);
    const title = makeText('Unlocks', 22, THEME.text, { fontWeight: 'bold' });
    title.position.set(m.x + 24, m.y + 20);
    const sub = makeText('Go far in a direction to unlock its legendary blocks (bought with Medals and credits). Ordinary blocks unlock in the campaign. Tap to close.', 13, THEME.textDim, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: m.w - 48 });
    sub.position.set(m.x + 24, m.y + 52);
    this.unlocksC.addChild(title, sub);
    const colW = (m.w - 40) / 2;
    UNLOCK_SECTORS.forEach((sec, qi) => {
      const x0 = m.x + 20 + (qi % 2) * colW;
      let y = m.y + 92 + Math.floor(qi / 2) * 232;
      const h = makeText(`${SECTOR_NAME[sec]}  ·  furthest ring ${fmtBig(reach[sec])}`, 15, THEME.text, { fontWeight: 'bold' });
      h.position.set(x0 + 6, y);
      this.unlocksC.addChild(h);
      y += 26;
      for (const u of UNLOCKS.filter(e => e.sector === sec)) {
        const got = reach[sec] >= u.ring;
        const legendary = BLOCKS[u.blockId]?.category === 'legendary';
        const row = makeText(`Ring ${u.ring}`, 13, got ? PROGRESS_COLOR : THEME.textDim, { fontWeight: 'bold' });
        row.position.set(x0 + 12, y);
        const name = makeText(blockName(u.blockId), 13, legendary ? CATEGORY_COLOR.legendary : got ? THEME.text : THEME.textDim, { fontWeight: 'bold' });
        name.position.set(x0 + 76, y);
        const st = makeText(got ? 'Unlocked' : 'Locked', 13, got ? PROGRESS_COLOR : THEME.textDim, { fontWeight: 'bold' });
        st.anchor.set(1, 0);
        st.position.set(x0 + colW - 8, y);
        this.unlocksC.addChild(row, name, st);
        y += 22;
      }
    });
    this.unlocksC.visible = true;
    this.unlocksOpen = true;
  }

  closeUnlocks() {
    this.unlocksC.visible = false;
    this.unlocksOpen = false;
  }

  /** Lines of the open Unlocks panel (e2e hook). */
  private unlocksText(): string[] {
    return this.unlocksC.children.filter((c: any) => typeof c.text === 'string').map((c: any) => c.text);
  }

  update(dt: number) {
    this.toast.update(dt * 1000);
    const notices = this.store.takeUnlockNotices();
    if (notices.length) this.toast.show(notices.join('\n'), 3500);
    if (this.dirty) {
      this.dirty = false;
      this.redraw();
      this.updatePanel();
    }
  }

  statsInfo(o: StatsInfo) {
    o.name = 'FRONTIER';
    o.proj = 0; o.projCap = 0; o.enemies = 0; o.fx = 0; o.kills = 0;
    o.extra = `squares ${this.drawnSquares}  sprites ${this.spritesUsed}/${this.views.length * 5}  zoom ${this.zoom.toFixed(1)}`;
  }

  destroy() {
    this.gestures?.detach();
    this.unsub?.();
    if (frontierSession.onChange) frontierSession.onChange = null;
    this.container.destroy({ children: true });
    this.triTex.destroy(true);
    this.dotTex.destroy(true);
  }

  private installDevHook() {
    if (!import.meta.env.DEV) return;
    const store = this.store;
    (window as any).__mgbm = {
      screen: 'frontier',
      unlocked: () => isFrontierUnlocked(store.data),
      state: () => ({
        camera: { cx: frontierSession.cx, cy: frontierSession.cy, zoom: frontierSession.zoom },
        selected: frontierSession.sel ? { ...frontierSession.sel } : null,
        panel: { line1: this.line1.text, line2: this.line2.text, state: this.stateText.text, medal: this.medalText.text, spike: this.spikeText.text, note: this.countText.text, earned: this.earnText.text, play: this.playButton.enabled },
        unlocksOpen: this.unlocksOpen,
        drawnSquares: this.drawnSquares, spritesUsed: this.spritesUsed, pool: this.views.length * 5,
        medals: store.data.medals, credits: store.data.credits, sq: { ...store.data.frontier.sq }, toast: this.toast.message,
      }),
      stateAt: (x: number, y: number) => this.stateAt(x, y),
      hasMedal: (x: number, y: number) => this.world.hasMedal(x, y),
      squareScreen: (x: number, y: number) => this.squareScreen(x, y),
      select: (x: number, y: number) => this.select(x, y),
      jump: (x: number, y: number, zoom?: number) => frontierJump(x, y, zoom),
      pan: (dx: number, dy: number) => this.pan(dx, dy),
      zoomAt: (f: number, x: number, y: number) => this.zoomAt(f, x, y),
      play: () => this.play(),
      setTileStyle: (t: TileStyle) => { this.tileStyle = t; this.dirty = true; },
      kindAt: (x: number, y: number) => squareKind(x, y, this.f.seed),
      spikeAt: (x: number, y: number) => isSpikeSquare(x, y, this.f.seed),
      openUnlocks: () => this.openUnlocks(),
      closeUnlocks: () => this.closeUnlocks(),
      unlocksText: () => this.unlocksText(),
      reach: () => ({ ...store.frontierReach }),
      unlock: () => unlockFrontier(store),
      clearSquare: (x: number, y: number) => clearFrontierSquare(store, x, y),
      clearRing: (r: number) => clearFrontierRing(store, r),
      progress: store,
      unlockTier: MAP_UNLOCK_TIER,
    };
  }
}

function place(s: Sprite, x: number, y: number, size: number, tint: number) {
  s.visible = true;
  s.position.set(x, y);
  s.width = size;
  s.height = size;
  s.tint = tint;
}
