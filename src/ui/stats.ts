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
const LINES = 5;
const PLATE_H = LINES * LINE_H + PAD * 2;

/** Whether the overlay starts visible: ?stats=1/0 in the URL, else the remembered choice, else on in dev and off in production. */
export function initialStatsEnabled(): boolean {
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
  /** Fills the last text line source; set by the ScreenManager (the current screen's statsInfo). */
  provider: ((out: StatsInfo) => void) | null = null;

  private text = new Text({ text: '', style: { fill: 0xc8e6c8, fontSize: 10, fontFamily: 'Consolas, Menlo, monospace', lineHeight: LINE_H } });
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
    const plate = new Graphics().rect(PAD, PAD, WIDTH, PLATE_H).fill({ color: 0x000000, alpha: 0.6 });
    this.text.position.set(PAD * 2, PAD * 2);
    this.container.addChild(plate, this.text);
    this.container.eventMode = 'none';
    this.container.visible = this.enabled;
  }

  /** Vertical space a screen should leave free at its top-left for its own HUD. */
  get hudOffset(): number { return this.enabled ? PLATE_H + PAD * 2 : 0; }

  toggle() { this.set(!this.enabled); }

  set(on: boolean) {
    this.enabled = on;
    this.container.visible = on;
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
  get shown(): string { return this.text.text; }

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
    this.text.text =
      `${i.name}   kills ${i.kills}\n` +
      `FPS ${Math.round(this.fps)}  worst ${f1(Math.max(this.worstA, this.worstB))}ms  frame ${f1(this.avgFrame)}ms\n` +
      `sim ${f2(this.simMs)}  render ${f2(this.renderMs)}  ovh ${f2(this.ovhMs)} ms\n` +
      `proj ${i.proj}/${i.projCap}  enemies ${i.enemies}  fx ${i.fx}\n` +
      i.extra;
  }
}
