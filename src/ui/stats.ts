import { Container, Graphics, Text } from 'pixi.js';

/** What a screen reports to the overlay, filled in at the overlay's refresh rate (about 4 per second). */
export interface StatsInfo {
  name: string;
  proj: number;
  projCap: number;
  enemies: number;
  /** Damage numbers, bursts and other short-lived effects alive. */
  fx: number;
  kills: number;
  /** Free-form last line: spawn rate on Free Fly, blocks / scroll / camera on the wall. */
  extra: string;
}

const STORAGE_KEY = 'mgbm.stats';
const REFRESH_MS = 250;
const WINDOW_MS = 500;
const LINE_H = 12;
const PAD = 4;
const WIDTH = 236;
const LINES = 6;
const PLATE_H = LINES * LINE_H + PAD * 2;

/** Game column size (src/config VIEW) and how main.ts fits the canvas: scale = min(w / 540, h / 960), floored. */
const GAME_W = 540;
const GAME_H = 960;
/** Width of the side panel's plate and the gap it keeps from the window edge and from the game. */
const SIDE_PANEL_W = 236;
const SIDE_GAP = 8;
/** The side panel is used when the blank column beside the game is at least this wide (plate + a gap on each side). */
export const SIDE_MIN_BLANK = SIDE_PANEL_W + 2 * SIDE_GAP;

export type StatsPlacement = 'side' | 'canvas';

/** Where the stats show for a window size: in the blank space beside the letterboxed game if it is wide enough, else in the canvas. */
export function statsPlacement(winW: number, winH: number): StatsPlacement {
  const gameW = Math.floor(GAME_W * Math.min(winW / GAME_W, winH / GAME_H));
  return (winW - gameW) / 2 >= SIDE_MIN_BLANK ? 'side' : 'canvas';
}

/** Whether the overlay starts visible: ?stats=1/0 in the URL, else the remembered choice, else on in dev and off in production. */
function initialStatsEnabled(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('stats');
    if (q === '1' || q === '0') { save(q === '1'); return q === '1'; }
  } catch { /* no window */ }
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === '1' || v === '0') return v === '1';
  } catch { /* storage blocked */ }
  return !!import.meta.env.DEV;
}

function save(on: boolean) {
  try { window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
}

/**
 * Top-left stats plate, drawn above every screen. While hidden it costs nothing: the frame hooks return at once and no
 * text is built. While visible each frame only adds a few numbers; the text is rebuilt about four times a second.
 */
export class StatsOverlay {
  readonly container = new Container();
  enabled: boolean;
  /** Where it is drawn now; `layout()` re-decides it from the window size. */
  placement: StatsPlacement = 'canvas';
  /** The DOM plate of the side version (made on first use; absent in tests without a document). */
  private side: HTMLDivElement | null = null;
  /** Fills the last text line source; set by the ScreenManager (the current screen's statsInfo). */
  provider: ((out: StatsInfo) => void) | null = null;

  private text = new Text({ text: '', style: { fill: 0xc8e6c8, fontSize: 10, fontFamily: 'Consolas, Menlo, monospace', lineHeight: LINE_H } });
  /** Git branch and commit of the dev server's checkout (dev only, from /__build). */
  private build = '';
  private info: StatsInfo = { name: '', proj: 0, projCap: 0, enemies: 0, fx: 0, kills: 0, extra: '' };

  // Window accumulators (numbers only: no allocation per frame).
  private winStart = 0;
  private winFrames = 0;
  private winSum = 0;
  private fps = 0;
  private avgFrame = 0;
  private worstA = 0;       // worst frame of the current 0.5 s half-second
  private worstB = 0;       // ... and of the previous one; the worst of the last second is max(a, b)
  private simAcc = 0;
  private renderAcc = 0;
  private ovhAcc = 0;
  private simMs = 0;
  private renderMs = 0;
  private ovhMs = 0;
  private lastRefresh = 0;

  constructor() {
    this.enabled = initialStatsEnabled();
    if (import.meta.env.DEV && typeof fetch === 'function') {
      fetch('/__build').then(r => r.json()).then((b: { branch: string; hash: string; dirty: boolean }) => {
        this.build = `${b.branch} @ ${b.hash}${b.dirty ? '+' : ''}`;
      }).catch(() => { /* not served by the dev server */ });
    }
    const plate = new Graphics().rect(PAD, PAD, WIDTH, PLATE_H).fill({ color: 0x000000, alpha: 0.6 });
    this.text.position.set(PAD * 2, PAD * 2);
    this.container.addChild(plate, this.text);
    this.container.eventMode = 'none';
    this.layout();
  }

  /** Re-decides side or in-canvas from the window size (call on resize); exactly one version is visible, the other is hidden and idle. */
  layout(winW = typeof window !== 'undefined' ? window.innerWidth : 0, winH = typeof window !== 'undefined' ? window.innerHeight : 0) {
    this.placement = statsPlacement(winW, winH);
    this.apply();
  }

  private apply() {
    const side = this.placement === 'side';
    this.container.visible = this.enabled && !side;
    if (this.enabled && side && !this.side && typeof document !== 'undefined') {
      const d = document.createElement('div');
      d.id = 'stats-side';
      // Fixed in the blank column left of the game, right-aligned to the game's edge; no pointer input.
      d.style.cssText = `position:fixed;top:${SIDE_GAP}px;width:${SIDE_PANEL_W}px;box-sizing:border-box;padding:${PAD * 2}px;z-index:9000;`
        + 'background:rgba(0,0,0,0.6);color:#c8e6c8;font:10px/12px Consolas,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere;pointer-events:none;user-select:none;display:none';
      document.body.appendChild(d);
      this.side = d;
    }
    if (this.side) {
      this.side.style.display = this.enabled && side ? 'block' : 'none';
      const gameW = Math.floor(GAME_W * Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H));
      this.side.style.left = `${Math.max(SIDE_GAP, (window.innerWidth - gameW) / 2 - SIDE_PANEL_W - SIDE_GAP)}px`;
    }
  }

  /** Vertical space a screen should leave free at its top-left for its own HUD (none when the stats are beside the game). */
  get hudOffset(): number { return this.enabled && this.placement === 'canvas' ? PLATE_H + PAD * 2 : 0; }

  toggle() { this.set(!this.enabled); }

  set(on: boolean) {
    this.enabled = on;
    this.apply();
    save(on);
    if (on) { this.winStart = 0; this.lastRefresh = 0; }
  }

  /** After the simulation steps of a tick: `frameMs` is the wall-clock time since the previous tick, `simMs` the steps' cost. */
  frame(now: number, frameMs: number, simMs: number) {
    if (!this.enabled) return;
    const t0 = performance.now();
    if (this.winStart === 0) { this.winStart = now; this.worstA = this.worstB = 0; }
    this.winFrames++;
    this.winSum += frameMs;
    this.simAcc += simMs;
    if (frameMs > this.worstA) this.worstA = frameMs;
    if (now - this.winStart >= WINDOW_MS) {
      const n = this.winFrames || 1;
      this.avgFrame = this.winSum / n;
      this.fps = this.avgFrame > 0 ? 1000 / this.avgFrame : 0;
      this.simMs = this.simAcc / n;
      this.renderMs = this.renderAcc / n;
      this.ovhMs = this.ovhAcc / n;
      this.worstB = this.worstA;
      this.worstA = 0;
      this.winFrames = 0; this.winSum = 0; this.simAcc = 0; this.renderAcc = 0; this.ovhAcc = 0;
      this.winStart = now;
    }
    if (now - this.lastRefresh >= REFRESH_MS) {
      this.lastRefresh = now;
      this.refresh();
    }
    this.ovhAcc += performance.now() - t0;
  }

  /** CPU time of the renderer's draw call (GPU work is asynchronous and not included). */
  render(ms: number) {
    if (this.enabled) this.renderAcc += ms;
  }

  /** The last text shown (e2e). */
  get shown(): string { return this.shownText; }
  private shownText = '';
  /** The side plate (e2e); null until it was first shown. */
  get sideElement(): HTMLElement | null { return this.side; }

  /** Last figures (e2e and reports). */
  get numbers() {
    return { fps: this.fps, frameMs: this.avgFrame, worstMs: Math.max(this.worstA, this.worstB), simMs: this.simMs, renderMs: this.renderMs, overheadMs: this.ovhMs, last: this.info };
  }

  private refresh() {
    const i = this.info;
    i.name = ''; i.proj = i.projCap = i.enemies = i.fx = i.kills = 0; i.extra = '';
    if (this.provider) this.provider(i);
    const f1 = (n: number) => n.toFixed(1);
    const f2 = (n: number) => n.toFixed(2);
    const out =
      `${i.name}   kills ${i.kills}\n` +
      `FPS ${Math.round(this.fps)}  worst ${f1(Math.max(this.worstA, this.worstB))}ms  frame ${f1(this.avgFrame)}ms\n` +
      `sim ${f2(this.simMs)}  render ${f2(this.renderMs)}  ovh ${f2(this.ovhMs)} ms\n` +
      `proj ${i.proj}/${i.projCap}  enemies ${i.enemies}  fx ${i.fx}\n` +
      i.extra + '\n' +
      (this.build ? `build ${this.build}` : '');
    // Only the visible version is written.
    if (this.placement === 'side') { if (this.side) this.side.textContent = out; } else this.text.text = out;
    this.shownText = out;
  }
}
