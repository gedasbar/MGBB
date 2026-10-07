import { Container, Graphics, Text, TextStyleOptions } from 'pixi.js';
import { CompileStats } from '../engine/compiler';
import { COLORS, drawWarn } from './draw';
import { inRect, LAYOUT, Rect, VIEW_W } from './layout';

export function makeText(text: string, size: number, color: number = COLORS.text, opts: Partial<TextStyleOptions> = {}): Text {
  return new Text({ text, style: { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: size, fill: color, ...opts } });
}

export interface ButtonSpec {
  id: string;
  rect: Rect;
  /** Draws the face of the button (called again on every redraw). */
  draw: (g: Graphics, b: UIButton) => void;
  onTap: () => void;
  label?: string;
  labelColor?: number;
  labelSize?: number;
}

/** A tappable rectangle. Hit testing is done by BuildScreen from the gesture tracker, not by Pixi events. */
export class UIButton {
  readonly container = new Container();
  enabled = true;
  active = false;
  private face = new Graphics();
  private label: Text | null = null;

  constructor(readonly spec: ButtonSpec) {
    this.container.position.set(spec.rect.x, spec.rect.y);
    this.container.addChild(this.face);
    if (spec.label) {
      this.label = makeText(spec.label, spec.labelSize ?? 11, spec.labelColor ?? COLORS.textDim, { fontWeight: 'bold' });
      this.label.anchor.set(0.5, 1);
      this.label.position.set(spec.rect.w / 2, spec.rect.h - 2);
      this.container.addChild(this.label);
    }
    this.redraw();
  }

  get rect(): Rect { return this.spec.rect; }
  get id(): string { return this.spec.id; }

  hit(x: number, y: number): boolean {
    return this.container.visible && inRect(this.spec.rect, x, y);
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    this.container.alpha = v ? 1 : 0.5;
  }

  setActive(v: boolean) {
    if (this.active === v) return;
    this.active = v;
    this.redraw();
  }

  setLabel(t: string) {
    if (this.label) this.label.text = t;
  }

  redraw() {
    this.face.clear();
    this.spec.draw(this.face, this);
  }
}

export class Toast {
  readonly container = new Container();
  private bg = new Graphics();
  private text = makeText('', 16, 0xffffff, { align: 'center', wordWrap: true, wordWrapWidth: 440, fontWeight: 'bold' });
  private left = 0;
  private total = 1;

  constructor() {
    this.container.addChild(this.bg, this.text);
    this.container.visible = false;
    this.text.anchor.set(0.5);
  }

  show(msg: string, ms = 2200) {
    this.text.text = msg;
    const w = Math.min(480, this.text.width + 36);
    const h = this.text.height + 22;
    const cx = VIEW_W / 2;
    const cy = LAYOUT.stats.y - 54;
    this.bg.clear().roundRect(cx - w / 2, cy - h / 2, w, h, 14).fill({ color: 0x101010, alpha: 0.94 }).stroke({ color: COLORS.red, width: 2 });
    this.text.position.set(cx, cy);
    this.container.visible = true;
    this.container.alpha = 1;
    this.left = ms;
    this.total = ms;
  }

  get message(): string { return this.container.visible ? this.text.text : ''; }

  update(frameMs: number) {
    if (this.left <= 0) return;
    this.left -= frameMs;
    if (this.left <= 0) { this.container.visible = false; return; }
    this.container.alpha = Math.min(1, this.left / Math.min(400, this.total));
  }
}

/** Two-line strip under the top bar: name and exact rule text of whatever is selected. */
export class Inspector {
  readonly container = new Container();
  private title = makeText('', 15, 0xffffff, { fontWeight: 'bold' });
  private body = makeText('', 14, 0xdcdcdc, { wordWrap: true, wordWrapWidth: VIEW_W - 20, lineHeight: 17 });

  constructor() {
    const r = LAYOUT.inspector;
    const bg = new Graphics().rect(r.x, r.y, r.w, r.h).fill(0x4a4a4a).rect(r.x, r.y + r.h - 1, r.w, 1).fill(0x222222);
    this.title.position.set(10, r.y + 5);
    this.body.position.set(10, r.y + 24);
    this.container.addChild(bg, this.title, this.body);
  }

  set(title: string, body: string, titleColor = 0xffffff) {
    this.title.text = title;
    this.title.style.fill = titleColor;
    this.body.text = body;
  }

  get titleText(): string { return this.title.text; }
  get bodyText(): string { return this.body.text; }
}

function fmt(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.005) return String(Math.round(n));
  return n.toFixed(1);
}

function fmtDelta(n: number): string {
  if (Math.abs(n) < 0.005) return '';
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
}

export interface StatsDeltaLike { damagePerShot: number; projectilesPerPulse: number; pulsesPerSecond: number; estDps: number }

/** Thin strip: Dmg/shot · Proj/pulse · Pulses/s · Est. DPS · warnings. */
export class StatsStrip {
  readonly container = new Container();
  private bg = new Graphics();
  private cols: { label: Text; value: Text; delta: Text }[] = [];
  private warnG = new Graphics();
  readonly rect: Rect = { ...LAYOUT.stats };

  constructor() {
    this.container.addChild(this.bg);
    const names = ['Dmg/shot', 'Proj/pulse', 'Pulses/s', 'Est. DPS', 'Warnings'];
    names.forEach((n, i) => {
      const label = makeText(n, 11, COLORS.textDim);
      const value = makeText('0', 15, 0xffffff, { fontWeight: 'bold' });
      const delta = makeText('', 12, COLORS.green, { fontWeight: 'bold' });
      label.position.set(8 + i * 108, 2);
      value.position.set(8 + i * 108, 14);
      delta.position.set(0, 17);
      this.cols.push({ label, value, delta });
      this.container.addChild(label, value, delta);
    });
    this.container.addChild(this.warnG);
    this.moveTo(LAYOUT.stats.y);
  }

  moveTo(y: number) {
    this.rect.y = y;
    const r = LAYOUT.stats;
    this.bg.clear().rect(r.x, y, r.w, r.h).fill({ color: 0x2c2c2c, alpha: 0.97 }).rect(r.x, y, r.w, 1).fill(0x151515);
    this.cols.forEach((c, i) => {
      c.label.position.set(8 + i * 108, y + 2);
      c.value.position.set(8 + i * 108, y + 14);
    });
    this.container.position.set(0, 0);
    this.lastY = y;
  }

  private lastY = LAYOUT.stats.y;

  hit(x: number, y: number): boolean {
    return inRect(this.rect, x, y);
  }

  set(stats: CompileStats, delta?: StatsDeltaLike) {
    const vals = [stats.damagePerShot, stats.projectilesPerPulse, stats.pulsesPerSecond, stats.estDps];
    const d = delta ? [delta.damagePerShot, delta.projectilesPerPulse, delta.pulsesPerSecond, delta.estDps] : [0, 0, 0, 0];
    this.cols.forEach((c, i) => {
      if (i < 4) {
        c.value.text = fmt(vals[i]);
        const dt = delta ? fmtDelta(d[i]) : '';
        c.delta.text = dt;
        c.delta.style.fill = d[i] < 0 ? 0xff6a6a : COLORS.green;
        c.delta.position.set(c.value.x + c.value.width + 5, this.lastY + 16);
      }
    });
    const n = stats.warnings.length;
    const w = this.cols[4];
    w.value.text = String(n);
    w.value.style.fill = n > 0 ? COLORS.warn : 0xffffff;
    w.value.position.set(8 + 4 * 108 + 24, this.lastY + 14);
    w.delta.text = '';
    this.warnG.clear();
    drawWarn(this.warnG, 8 + 4 * 108 + 10, this.lastY + 23, n > 0 ? 18 : 15);
    this.warnG.alpha = n > 0 ? 1 : 0.4;
  }

  /** Text of one column, for tests and debugging. */
  texts(): string[] {
    return this.cols.map(c => c.value.text + (c.delta.text ? ` ${c.delta.text}` : ''));
  }
}

/** Full-width modal with a title and wrapped lines of text; any tap closes it. */
export class InfoPanel {
  readonly container = new Container();
  private dim = new Graphics();
  private panel = new Graphics();
  private title = makeText('', 20, 0xffffff, { fontWeight: 'bold' });
  private body = makeText('', 15, 0xe6e6e6, { wordWrap: true, wordWrapWidth: VIEW_W - 64, lineHeight: 20 });
  private warnings = makeText('', 14, COLORS.warn, { wordWrap: true, wordWrapWidth: VIEW_W - 64, lineHeight: 19 });

  constructor() {
    this.container.visible = false;
    this.container.addChild(this.dim, this.panel, this.title, this.body, this.warnings);
  }

  get isOpen(): boolean { return this.container.visible; }

  show(title: string, body: string, warnings: string[] = []) {
    this.title.text = title;
    this.body.text = body;
    this.warnings.text = warnings.length ? `Warnings\n${warnings.map(w => `• ${w}`).join('\n')}` : '';
    const x = 16;
    const w = VIEW_W - 32;
    const y = 150;
    this.title.position.set(x + 16, y + 14);
    this.body.position.set(x + 16, y + 48);
    this.warnings.position.set(x + 16, y + 48 + this.body.height + 14);
    const h = 48 + this.body.height + (warnings.length ? this.warnings.height + 14 : 0) + 56;
    this.dim.clear().rect(0, 0, VIEW_W, 960).fill({ color: 0x000000, alpha: 0.55 });
    this.panel.clear().roundRect(x, y, w, h, 14).fill(0x2a2a2a).stroke({ color: COLORS.red, width: 2 });
    const hint = this.panel;
    hint.roundRect(x + w - 112, y + h - 40, 96, 28, 8).fill({ color: COLORS.red, alpha: 0.9 });
    this.container.visible = true;
    if (!this.closeLabel) {
      this.closeLabel = makeText('Close', 14, 0xffffff, { fontWeight: 'bold' });
      this.closeLabel.anchor.set(0.5);
      this.container.addChild(this.closeLabel);
    }
    this.closeLabel.position.set(x + w - 64, y + h - 26);
  }

  private closeLabel: Text | null = null;

  hide() { this.container.visible = false; }

  get bodyText(): string { return this.body.text + '\n' + this.warnings.text; }
}
