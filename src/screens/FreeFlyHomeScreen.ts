import { Container, Graphics } from 'pixi.js';
import { Screen, ScreenManager } from './ScreenManager';
import { makeText, Toast, UIButton } from '../builder/ui';
import { makeTabButtons } from '../builder/tabs';
import { LAYOUT, VIEW_H, VIEW_W } from '../builder/layout';
import { CreditsBadge, textButton } from '../ui/hud';
import { drawTileFace } from '../ui/widgets';
import { UI } from '../ui/theme';
import { CORES_HINT, CURRENCY_CORES_NAME } from '../shipyard/constants';
import { fmtBig } from '../ui/format';
import { DEBUG_ON } from '../debug/enabled';
import { getProgressStore } from '../econ/progress';
import { clientToGame } from '../input';
import { CONFIG } from '../config';
import { GestureTracker } from '../builder/gestures';
import { mapMemory } from '../map/memory';
import { flyBestTime, flyMilestones, modeTitle } from '../map/modes';
import { backToCarousel, NO_EJECTOR_TEXT, startFreeFly } from '../map/nav';
import { goToTab } from '../map/tabs';

const HEADER_H = 52;
const ROW_H = 48;
const ROW_GAP = 8;
const PAD = 14;
const START = { x: 110, y: 790, w: 320, h: 80 };

/**
 * Chunk 29b: Free Fly's own mode screen (it used to be the builder's FLY button): best wave, best time, the Medal wave milestones (done or not) and a big START.
 * The "<" in the header returns to the mode carousel, centred on Free Fly.
 */
export class FreeFlyHomeScreen implements Screen {
  statsName = 'Free Fly';
  container = new Container();
  private store = getProgressStore();
  private credits = new CreditsBadge();
  private toast = new Toast();
  private buttons: UIButton[] = [];
  private startButton: UIButton;
  private gestures: GestureTracker | null = null;

  constructor(private sm: ScreenManager) {
    const p = this.store.data;
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(UI.color.page);
    const bar = new Graphics().rect(0, 0, VIEW_W, HEADER_H).fill(UI.color.panel).rect(0, HEADER_H - 1, VIEW_W, 1).fill(UI.color.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(UI.color.panel).rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(UI.color.border);
    const title = makeText(modeTitle('freefly'), UI.text.title, UI.color.text, { fontWeight: 'bold' });
    title.anchor.set(0, 0.5);
    title.position.set(64, 27);
    this.credits.set(p.credits);
    const back = textButton('freeFlyBack', { x: 6, y: 6, w: 46, h: 40 }, '<', () => backToCarousel(this.sm, 'freefly'), 24);
    this.buttons.push(back);
    this.container.addChild(bg, bar, title, this.credits.container);

    // Records: two rows.
    let y = HEADER_H + PAD;
    for (const [label, value] of [['Best wave', p.bestWave > 0 ? String(p.bestWave) : '–'], ['Best time', flyBestTime(p)]] as const) {
      this.container.addChild(this.row(y, label, value, UI.color.accent));
      y += ROW_H + ROW_GAP;
    }
    // Chunk 31a: Cores, the Shipyard's currency, earned only in Free Fly.
    this.container.addChild(this.row(y, CURRENCY_CORES_NAME, fmtBig(p.cores), UI.color.accent));
    y += ROW_H + ROW_GAP;
    const coresHint = makeText(CORES_HINT, UI.text.small, UI.color.textDim);
    coresHint.position.set(PAD, y - 2);
    this.container.addChild(coresHint);
    y += coresHint.height + UI.space.s;
    // Medal wave milestones.
    y += UI.space.s;
    const head = makeText('MEDAL WAVES', UI.text.header, UI.color.textDim, { fontWeight: 'bold' });
    head.position.set(PAD, y);
    this.container.addChild(head);
    y += head.height + UI.space.s;
    for (const m of flyMilestones(p)) {
      this.container.addChild(this.row(y, `Wave ${m.wave}`, `${m.done ? 'DONE' : 'not yet'}  ·  +${m.medals} Medal${m.medals > 1 ? 's' : ''}`, m.done ? UI.color.good : UI.color.textDim, m.done));
      y += ROW_H + ROW_GAP;
    }

    this.startButton = textButton('freeFlyStart', START, 'START', () => this.start(), 32);
    this.buttons.push(this.startButton);
    const tabs = makeTabButtons('tabMap', (id) => { if (id !== 'tabMap') goToTab(this.sm, id); });
    this.buttons.push(...tabs);
    this.container.addChild(back.container, this.startButton.container);
    for (const t of tabs) this.container.addChild(t.container);
    this.container.addChild(this.toast.container);
    this.installDevHook();
  }

  /** One panel row: the label at the left, the value at the right; `tick` adds a small tick mark before the label. */
  private row(y: number, label: string, value: string, valueColor: number, tick = false): Container {
    const c = new Container();
    c.addChild(drawTileFace(new Graphics(), { x: PAD, y, w: VIEW_W - 2 * PAD, h: ROW_H }));
    const l = makeText(label, UI.text.header, UI.color.text, { fontWeight: 'bold' });
    l.anchor.set(0, 0.5);
    l.position.set(PAD + 14 + (tick ? 26 : 0), y + ROW_H / 2);
    const v = makeText(value, UI.text.header, valueColor, { fontWeight: 'bold' });
    v.anchor.set(1, 0.5);
    v.position.set(VIEW_W - PAD - 14, y + ROW_H / 2);
    c.addChild(l, v);
    if (tick) c.addChild(new Graphics().moveTo(PAD + 14, y + ROW_H / 2).lineTo(PAD + 21, y + ROW_H / 2 + 8).lineTo(PAD + 34, y + ROW_H / 2 - 8).stroke({ color: UI.color.good, width: 3 }));
    return c;
  }

  start() {
    if (startFreeFly(this.sm) === 'noEjector') this.toast.show(NO_EJECTOR_TEXT);
  }

  init() {
    mapMemory().setOpen('freefly');
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => { const b = this.buttons.find(bb => bb.hit(x, y)); if (b && b.enabled) { b.flash(); b.spec.onTap(); } },
        onDrag: () => {}, onPinch: () => {}, onWheel: () => {}, canDrag: () => false,
      },
    );
    this.gestures.attach();
  }

  update(dt: number) { this.toast.update(dt * 1000); }

  destroy() {
    this.gestures?.detach();
    this.container.destroy({ children: true });
  }

  private installDevHook() {
    if (!DEBUG_ON) return;
    const p = this.store.data;
    (window as any).__mgbm = {
      screen: 'freefly-home',
      state: () => ({ cores: p.cores, bestWave: p.bestWave, bestTime: flyBestTime(p), milestones: flyMilestones(p), toast: this.toast.message }),
      buttonRect: (id: string) => this.buttons.find(b => b.id === id)?.rect,
      start: () => this.start(),
    };
  }
}
