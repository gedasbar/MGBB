import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { ShopScreen } from './ShopScreen';
import { CaptainScreen } from './CaptainScreen';
import { MapScreen } from './MapScreen';
import { WallScreen } from './WallScreen';
import { GestureTracker } from '../builder/gestures';
import { getBuilderModel } from '../builder/session';
import { inRect, LAYOUT, Rect, VIEW_W } from '../builder/layout';
import { makeTabButtons } from '../builder/tabs';
import { makeText, Toast, UIButton } from '../builder/ui';
import { getProgressStore, isFrontierUnlocked } from '../econ/progress';
import { CreditsBadge, textButton, TextButton } from '../ui/hud';
import { fmtBig } from '../ui/format';
import { CATEGORY_COLOR, THEME } from '../ui/theme';
import type { StatsInfo } from '../ui/stats';
import {
  FAR_ZOOM, FRONTIER_NAME, MAP_UNLOCK_TIER, MEDAL_DOT_ZOOM, WHEEL_ZOOM_RATE, ZOOM_MAX, ZOOM_MIN,
} from '../frontier/constants';
import { effectiveTier, frontierLevel, isSpikeSquare, squareLevel } from '../frontier/level';
import { frontierSession, frontierJump } from '../frontier/session';
import {
  canPlay, frontierCounts, frontierSquare, medalShown, nearestMedalSquare, SquareState, squareState,
} from '../frontier/state';
import { getWorld, parseKey, ring, sector, SECTOR_NAME } from '../frontier/world';
import { clearFrontierRing, clearFrontierSquare, unlockFrontier } from '../debug/cheats';

const TOP = 52;
const PANEL_Y = 704;
const TABS_Y = LAYOUT.tabs.y;
/** The map's screen rectangle (between the top bar and the panel). */
export const FRONTIER_MAP: Rect = { x: 0, y: TOP, w: VIEW_W, h: PANEL_Y - TOP };
const MCX = FRONTIER_MAP.x + FRONTIER_MAP.w / 2;
const MCY = FRONTIER_MAP.y + FRONTIER_MAP.h / 2;

const FRAME = 0x55555a;
const FRAME_LOCKED = 0x343437;
const INNER = 0x26262a;
const INNER_LOCKED = 0x1c1c1e;
const FAR_LOCKED = 0x313134;
/** Lavender outline of a passed square. */
const PASSED = 0xb9a6f0;
/** Cleared colour by effective-tier band of 20 tiers: the five block category colours. */
const BAND_COLORS = [CATEGORY_COLOR.pathing, CATEGORY_COLOR.status, CATEGORY_COLOR.modifier, CATEGORY_COLOR.damage, CATEGORY_COLOR.mitosis];
const BAND_TIERS = 20;
export const bandColor = (tier: number) => BAND_COLORS[Math.max(0, Math.min(BAND_COLORS.length - 1, Math.floor((tier - 1) / BAND_TIERS)))];
const shade = (c: number, k: number) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);

const STATE_LABEL: Record<SquareState, string> = { hole: 'Empty space', locked: 'Locked', available: 'Available', passed: 'Passed', cleared: 'Cleared' };
const STATE_COLOR: Record<SquareState, number> = { hole: THEME.textDim, locked: THEME.textDim, available: THEME.text, passed: PASSED, cleared: THEME.good };

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
  private buttons: UIButton[] = [];
  private playButton: TextButton;
  private gestures: GestureTracker | null = null;
  private dirty = true;
  private lastViews = 0;
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

    this.title.anchor.set(0, 0.5);
    this.title.position.set(64, 27);
    this.medalsText.anchor.set(0, 0.5);
    this.medalsText.position.set(64 + this.title.width + 16, 28);

    const back = textButton('frontierBack', { x: 6, y: 6, w: 46, h: 40 }, '<', () => this.sm.switchTo(new MapScreen(this.sm)), 24);
    const bw = Math.floor((VIEW_W - 4 * 10) / 3);
    const by = PANEL_Y + 10;
    const recenter = textButton('frontierRecenter', { x: 10, y: by, w: bw, h: 44 }, 'Recenter', () => this.goTo(0, 0), 17);
    const medal = textButton('frontierMedal', { x: 20 + bw, y: by, w: bw, h: 44 }, 'Nearest medal', () => this.goMedal(), 17);
    const edge = textButton('frontierEdge', { x: 30 + 2 * bw, y: by, w: bw, h: 44 }, FRONTIER_NAME, () => this.goEdge(), 17);
    this.playButton = textButton('frontierPlay', { x: VIEW_W - 14 - 150, y: TABS_Y - 12 - 56, w: 150, h: 56 }, 'PLAY', () => this.play(), 24);
    const tabs = makeTabButtons('tabMap', (id) => this.tapTab(id));
    this.buttons.push(back, recenter, medal, edge, this.playButton, ...tabs);

    const lx = 14;
    this.line1.position.set(lx, PANEL_Y + 64);
    this.line2.position.set(lx, PANEL_Y + 94);
    this.stateText.position.set(lx, PANEL_Y + 120);
    this.medalText.position.set(lx, PANEL_Y + 120);
    this.spikeText.position.set(lx, PANEL_Y + 146);
    this.countText.position.set(lx, PANEL_Y + 172);

    this.container.addChild(bg, this.tiles, this.selG, chrome, this.title, this.medalsText, this.credits.container,
      this.line1, this.line2, this.stateText, this.medalText, this.spikeText, this.countText);
    for (const b of this.buttons) this.container.addChild(b.container);
    this.toast.container.y = -150; // above the panel
    this.container.addChild(this.toast.container);

    this.unsub = this.store.onChange(() => { this.refreshBox(); this.dirty = true; });
    frontierSession.onChange = () => { this.clampZoom(); this.dirty = true; };
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
        // Far locked squares are one flat grey: skip the tier roll for them (most of a far view).
        const band = far && st === 'locked' ? 0 : bandColor(effectiveTier(x, y, seed));
        if (far) {
          const tint = st === 'cleared' ? band : st === 'passed' ? PASSED : st === 'available' ? shade(band, 0.55) : FAR_LOCKED;
          place(v.frame, sx, sy, size, tint);
          v.mid.visible = false; v.inner.visible = false; v.spike.visible = false;
          used++;
        } else {
          const locked = st === 'locked';
          const frameTint = st === 'cleared' ? shade(band, 0.7) : st === 'passed' ? PASSED : locked ? FRAME_LOCKED : FRAME;
          place(v.frame, sx, sy, size, frameTint);
          const m1 = Math.max(2, Math.round(size * 0.12));
          place(v.mid, sx + m1, sy + m1, size - 2 * m1, st === 'cleared' ? band : shade(band, locked ? 0.18 : 0.55));
          used += 2;
          if (st === 'cleared') v.inner.visible = false;
          else {
            const m2 = Math.round(size * 0.27);
            place(v.inner, sx + m2, sy + m2, size - 2 * m2, locked ? INNER_LOCKED : INNER);
            used++;
          }
          if (isSpikeSquare(x, y, seed)) {
            place(v.spike, sx + m1, sy + m1, size * 0.3, THEME.bad);
            v.spike.alpha = locked ? 0.5 : 1;
            used++;
          } else v.spike.visible = false;
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
    // Selection outline.
    this.selG.clear();
    const sel = this.squareScreen(s.sel.x, s.sel.y);
    if (inRect(FRONTIER_MAP, sel.x, sel.y)) {
      const r = size / 2 + Math.max(2, z * 0.06);
      this.selG.rect(sel.x - r, sel.y - r, 2 * r, 2 * r).stroke({ color: THEME.select, width: far ? 2 : 3 });
    }
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
    const { x, y } = frontierSession.sel;
    const st = this.stateAt(x, y);
    const p = this.store.data;
    this.credits.set(p.credits);
    const counts = frontierCounts(this.f);
    this.medalsText.text = `Medals ${fmtBig(p.medals)}`;
    this.countText.text = `${fmtBig(counts.cleared)} cleared · ${fmtBig(counts.passed - counts.cleared)} passed`;
    this.line1.text = `(${fmtBig(x)}, ${fmtBig(y)})`;
    if (st === 'hole') {
      this.line2.text = `Ring ${fmtBig(ring(x, y))}  ·  ${SECTOR_NAME[sector(x, y)]}`;
      this.stateText.text = STATE_LABEL.hole;
      this.medalText.text = '';
      this.spikeText.text = '';
    } else {
      const lv = squareLevel(x, y, this.f.seed);
      this.line2.text = `Ring ${fmtBig(lv.ring)}  ·  ${SECTOR_NAME[sector(x, y)]}  ·  Tier ${fmtBig(lv.tier)}`;
      this.stateText.text = STATE_LABEL[st];
      this.medalText.text = medalShown(this.f, x, y) ? '·  Medal on first clear' : '';
      this.medalText.x = this.stateText.x + this.stateText.width + 10;
      this.spikeText.text = lv.spike ? 'SPIKE: every block has 1.6x HP' : '';
    }
    this.stateText.style.fill = STATE_COLOR[st];
    const ok = canPlay(this.f, x, y);
    this.playButton.setEnabled(ok);
    this.playButton.setText(st === 'passed' || st === 'cleared' ? 'REPLAY' : 'PLAY');
  }

  /** Why the selected square cannot be played (empty when it can). */
  private playBlocked(): string {
    const { x, y } = frontierSession.sel;
    const st = this.stateAt(x, y);
    if (st === 'hole') return 'Empty space: nothing to play here';
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

  select(x: number, y: number) {
    frontierSession.sel = { x, y };
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
    const { x, y } = frontierSession.sel;
    if (!canPlay(this.f, x, y)) return;
    const model = getBuilderModel();
    if (model.compiled.recipes.length === 0) { this.toast.show("Your circuit doesn't reach an ejector"); return; }
    this.sm.switchTo(new WallScreen(this.sm, frontierLevel(squareLevel(x, y, this.f.seed)), model.gridForFlight()));
  }

  update(dt: number) {
    this.toast.update(dt * 1000);
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
  }

  private installDevHook() {
    if (!import.meta.env.DEV) return;
    const store = this.store;
    (window as any).__mgbm = {
      screen: 'frontier',
      unlocked: () => isFrontierUnlocked(store.data),
      state: () => ({
        camera: { cx: frontierSession.cx, cy: frontierSession.cy, zoom: frontierSession.zoom },
        selected: { ...frontierSession.sel },
        panel: { line1: this.line1.text, line2: this.line2.text, state: this.stateText.text, medal: this.medalText.text, spike: this.spikeText.text, play: this.playButton.enabled },
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
