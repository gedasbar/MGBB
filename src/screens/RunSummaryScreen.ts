import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { FlyScreen } from './FlyScreen';
import { GestureTracker } from '../builder/gestures';
import { getBuilderModel } from '../builder/session';
import { inRect, VIEW_W } from '../builder/layout';
import { makeText, Toast, UIButton } from '../builder/ui';
import { getProgressStore, RunResult } from '../econ/progress';
import { fmtBig } from '../ui/format';
import { textButton } from '../ui/hud';
import { THEME } from '../ui/theme';

export function fmtTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Shown when the hull reaches 0. The run has already been banked into the progress by FlyScreen. */
export class RunSummaryScreen implements Screen {
  container = new Container();
  private toast = new Toast();
  private buttons: UIButton[] = [];
  private gestures: GestureTracker | null = null;
  private rows: { label: string; value: string; best: boolean }[];

  constructor(private sm: ScreenManager, readonly result: RunResult, readonly marks: { newBestTier: boolean; newBestTime: boolean }) {
    const bg = new Graphics().rect(0, 0, CONFIG.VIEW.W, CONFIG.VIEW.H).fill(THEME.bg);
    this.container.addChild(bg);

    const title = makeText('Run Summary', 32, THEME.text, { fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 70);
    const credits = makeText(`+${fmtBig(result.credits)}`, 80, THEME.currency, { fontWeight: 'bold' });
    credits.anchor.set(0.5);
    credits.position.set(VIEW_W / 2, 190);
    const creditsLabel = makeText('credits earned', 18, THEME.textDim, { fontWeight: 'bold' });
    creditsLabel.anchor.set(0.5);
    creditsLabel.position.set(VIEW_W / 2, 250);
    this.container.addChild(title, credits, creditsLabel);

    this.rows = [
      { label: 'Kills', value: String(result.kills), best: false },
      { label: 'Time survived', value: fmtTime(result.time), best: marks.newBestTime },
      { label: 'Highest tier', value: String(result.tier), best: marks.newBestTier },
    ];
    this.rows.forEach((r, i) => {
      const y = 310 + i * 74;
      const row = new Graphics().rect(40, y, VIEW_W - 80, 66).fill(THEME.panel).stroke({ color: THEME.border, width: 1.5 });
      const label = makeText(r.label, 20, THEME.textDim, { fontWeight: 'bold' });
      label.position.set(58, y + 20);
      const value = makeText(r.value, 30, THEME.text, { fontWeight: 'bold' });
      value.anchor.set(1, 0);
      value.position.set(VIEW_W - 58, y + 14);
      this.container.addChild(row, label, value);
      if (r.best) {
        const mark = makeText('New best!', 16, THEME.good, { fontWeight: 'bold' });
        mark.anchor.set(1, 0.5);
        mark.position.set(VIEW_W - 58 - value.width - 16, y + 33);
        this.container.addChild(mark);
      }
    });

    const total = makeText(`Total credits: ${fmtBig(getProgressStore().data.credits)}`, 20, THEME.currency, { fontWeight: 'bold' });
    total.anchor.set(0.5);
    total.position.set(VIEW_W / 2, 580);
    this.container.addChild(total);

    for (const b of [
      textButton('summaryBuild', { x: 40, y: 640, w: 210, h: 64 }, 'Build', () => this.sm.switchTo(new BuildScreen(this.sm)), 24),
      textButton('summaryFly', { x: 290, y: 640, w: 210, h: 64 }, 'Fly again', () => this.flyAgain(), 24),
    ]) {
      this.buttons.push(b);
      this.container.addChild(b.container);
    }
    this.container.addChild(this.toast.container);

    if (import.meta.env.DEV) {
      (window as any).__mgbm = {
        screen: 'summary',
        state: () => ({ result, marks, rows: this.rows, credits: getProgressStore().data.credits, toast: this.toast.message }),
      };
    }
  }

  init() {
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => this.tap(x, y),
        onDrag: () => {},
        onPinch: () => {},
        onWheel: () => {},
        canDrag: () => false,
      },
    );
    this.gestures.attach();
  }

  destroy() {
    this.gestures?.detach();
    this.container.destroy({ children: true });
  }

  update(dt: number) {
    this.toast.update(dt * 1000);
  }

  private tap(x: number, y: number) {
    const b = this.buttons.find(bb => inRect(bb.rect, x, y));
    if (b && b.enabled) { b.flash(); b.spec.onTap(); }
  }

  /** A new run with the current circuit, if it reaches an ejector. */
  private flyAgain() {
    const model = getBuilderModel();
    if (model.compiled.recipes.length === 0) {
      this.toast.show("Your circuit doesn't reach an ejector");
      return;
    }
    this.sm.switchTo(new FlyScreen(this.sm, model.gridForFlight()));
  }
}
