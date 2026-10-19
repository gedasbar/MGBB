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

/** Layout of the four Free Fly rows (the three wall rows keep the old 310 / 74 / 66). */
const ROWS4_TOP = 296;
const ROWS4_STEP = 62;
const ROWS4_H = 56;

/** The wall-level variant of the summary: replaces the Free Fly rows and the "Fly again" button with "Retry". */
export interface WallSummary {
  /** How the level ended: all blocks destroyed, flown past the end, or crashed into a block (failed: a Frontier encounter). */
  result: 'cleared' | 'passed' | 'crashed' | 'failed';
  /** A Frontier Free Fly encounter (chunk 15b): survived time out of `duration`, and the kills. */
  encounter?: { duration: number; kills: number };
  destroyed: number;
  total: number;
  /** Two or three buttons, left to right. */
  buttons: { id: string; label: string; onTap: () => void; enabled?: boolean }[];
  /** A first-clear Medal was just earned. */
  medal?: boolean;
}

/** What a finished run did for the captain (chunk 13a), shown under the totals. */
export interface CaptainSummary {
  name: string;
  killsAdded: number;
  killsTotal: number;
  /** Medals earned this run (a doubled award counts both). */
  medals: number;
  doubled: boolean;
  /** Optional extra line, e.g. the pass bonus. */
  note?: string;
}

/** Shown when the hull reaches 0. The run has already been banked into the progress by FlyScreen. */
export class RunSummaryScreen implements Screen {
  statsName = 'Summary';
  container = new Container();
  private toast = new Toast();
  private buttons: UIButton[] = [];
  private gestures: GestureTracker | null = null;
  private rows: { label: string; value: string; best: boolean }[];

  constructor(private sm: ScreenManager, readonly result: RunResult, readonly marks: { newBestTier: boolean; newBestTime: boolean; newBestWave?: boolean }, readonly wall?: WallSummary, readonly captain?: CaptainSummary) {
    const bg = new Graphics().rect(0, 0, CONFIG.VIEW.W, CONFIG.VIEW.H).fill(THEME.bg);
    this.container.addChild(bg);

    const enc = wall?.encounter;
    const titleText = enc ? `Encounter ${wall!.result === 'cleared' ? 'cleared' : wall!.result === 'passed' ? 'passed' : 'failed'}`
      : wall ? (wall.result === 'cleared' ? 'Tier cleared' : wall.result === 'passed' ? 'Tier passed' : 'Crashed') : 'Run Summary';
    const title = makeText(titleText, 32, THEME.text, { fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 70);
    const credits = makeText(`+${fmtBig(result.credits)}`, 80, THEME.currency, { fontWeight: 'bold' });
    credits.anchor.set(0.5);
    credits.position.set(VIEW_W / 2, 190);
    const creditsLabel = makeText('credits earned', 18, THEME.textDim, { fontWeight: 'bold' });
    creditsLabel.anchor.set(0.5);
    creditsLabel.position.set(VIEW_W / 2, 250);
    this.container.addChild(title, credits, creditsLabel);

    this.rows = enc ? [
      { label: 'Survived', value: `${fmtTime(result.time)} / ${fmtTime(enc.duration)}`, best: false },
      { label: 'Kills', value: String(enc.kills), best: false },
      { label: 'Result', value: wall!.result === 'cleared' ? 'CLEARED' : wall!.result === 'passed' ? 'PASSED' : 'FAILED', best: false },
    ] : wall ? [
      { label: 'Destroyed', value: `${Math.floor(wall.total ? (wall.destroyed / wall.total) * 100 : 100)}% (${wall.destroyed} / ${wall.total})`, best: false },
      { label: 'Time', value: fmtTime(result.time), best: false },
      { label: 'Result', value: wall.result === 'crashed' ? 'Not passed' : wall.result === 'passed' ? 'Passed' : 'Cleared', best: false },
    ] : [
      // Free Fly (chunk 10a): the wave reached leads; four rows, so they are packed a little tighter.
      { label: 'Wave reached', value: String(result.wave ?? 1), best: !!marks.newBestWave },
      { label: 'Time survived', value: fmtTime(result.time), best: marks.newBestTime },
      { label: 'Kills', value: String(result.kills), best: false },
      { label: 'Highest tier', value: String(result.tier), best: marks.newBestTier },
    ];
    const four = this.rows.length > 3;
    const top = four ? ROWS4_TOP : 310, step = four ? ROWS4_STEP : 74, rowH = four ? ROWS4_H : 66;
    this.rows.forEach((r, i) => {
      const y = top + i * step;
      const row = new Graphics().rect(40, y, VIEW_W - 80, rowH).fill(THEME.panel).stroke({ color: THEME.border, width: 1.5 });
      const label = makeText(r.label, 20, THEME.textDim, { fontWeight: 'bold' });
      label.position.set(58, y + rowH / 2 - 13);
      const value = makeText(r.value, 30, THEME.text, { fontWeight: 'bold' });
      value.anchor.set(1, 0);
      value.position.set(VIEW_W - 58, y + rowH / 2 - 19);
      this.container.addChild(row, label, value);
      if (r.best) {
        const mark = makeText('New best!', 16, THEME.good, { fontWeight: 'bold' });
        mark.anchor.set(1, 0.5);
        mark.position.set(VIEW_W - 58 - value.width - 16, y + rowH / 2);
        this.container.addChild(mark);
      }
    });

    const total = makeText(`Total credits: ${fmtBig(getProgressStore().data.credits)}`, 20, THEME.currency, { fontWeight: 'bold' });
    total.anchor.set(0.5);
    total.position.set(VIEW_W / 2, 580);
    this.container.addChild(total);

    const medals = captain?.medals ?? (wall?.medal ? 1 : 0);
    if (medals > 0) {
      const m = makeText(`+${medals} Medal${medals === 1 ? '' : 's'}`, 22, THEME.currency, { fontWeight: 'bold' });
      m.anchor.set(0.5);
      m.position.set(VIEW_W / 2, four ? 276 : 284);
      this.container.addChild(m);
      if (captain?.doubled) {
        const d = makeText('DOUBLED!', 16, THEME.good, { fontWeight: 'bold' });
        d.anchor.set(0, 0.5);
        d.position.set(VIEW_W / 2 + m.width / 2 + 10, four ? 276 : 284);
        this.container.addChild(d);
      }
    }
    if (captain) {
      const line = `${captain.name}: +${captain.killsAdded} kills (${captain.killsTotal} in all)${captain.note ? `   ${captain.note}` : ''}`;
      const c = makeText(line, 16, THEME.textDim, { fontWeight: 'bold' });
      c.anchor.set(0.5);
      c.position.set(VIEW_W / 2, 612);
      this.container.addChild(c);
    }

    const buttons = wall
      ? (() => {
        const n = wall.buttons.length;
        const w = n === 3 ? 160 : 210;
        const xs = n === 3 ? [20, 190, 360] : [40, 290];
        return wall.buttons.map((b, i) => {
          const tb = textButton(b.id, { x: xs[i], y: 640, w, h: 64 }, b.label, b.onTap, n === 3 ? 20 : 24);
          if (b.enabled === false) tb.setEnabled(false);
          return tb;
        });
      })()
      : [
        textButton('summaryBuild', { x: 40, y: 640, w: 210, h: 64 }, 'Build', () => this.sm.switchTo(new BuildScreen(this.sm)), 24),
        textButton('summaryFly', { x: 290, y: 640, w: 210, h: 64 }, 'Fly again', () => this.flyAgain(), 24),
      ];
    for (const b of buttons) {
      this.buttons.push(b);
      this.container.addChild(b.container);
    }
    this.container.addChild(this.toast.container);

    if (import.meta.env.DEV) {
      (window as any).__mgbm = {
        screen: 'summary',
        state: () => ({ title: title.text, wall: wall ?? null, captain: captain ?? null, result, marks, rows: this.rows, credits: getProgressStore().data.credits, toast: this.toast.message }),
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
