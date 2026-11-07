import { Container, Graphics } from 'pixi.js';
import { Screen, ScreenManager } from './ScreenManager';
import { makeText, Toast, UIButton } from '../builder/ui';
import { makeTabButtons } from '../builder/tabs';
import { LAYOUT, VIEW_H, VIEW_W } from '../builder/layout';
import { CreditsBadge, textButton } from '../ui/hud';
import { amountLabel, drawTileFace } from '../ui/widgets';
import { UI } from '../ui/theme';
import { DEBUG_ON } from '../debug/enabled';
import { getProgressStore } from '../econ/progress';
import { clientToGame } from '../input';
import { CONFIG } from '../config';
import { GestureTracker } from '../builder/gestures';
import { mapMemory } from '../map/memory';
import { backToCarousel, NO_EJECTOR_TEXT, startDailyRun } from '../map/nav';
import { goToTab } from '../map/tabs';
import { fmtCountdown, gameNow, nextMidnight } from '../daily/clock';
import { historyView, twistOf } from '../daily/rules';
import { QUEST_BY_KIND, DAILY_ALL_BONUS, DAILY_QUEST_COUNT } from '../data/dailyQuests';
import { RUN_TIERS } from '../data/dailyRun';
import { fmtBig } from '../ui/format';

const HEADER_H = 52;
const PAD = 14;
const CARD_H = 84;
const CARD_GAP = 8;
const START = { x: 110, y: 814, w: 320, h: 70 };
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Chunk 35a: the DAILY mode screen. Top to bottom: the countdown to the local-midnight reset, today's three quests (progress bar, reward, one free reroll a day),
 * the all-three bonus, the daily run (today's twist, the reward tiers, START) and the best wave of the last seven days. Everything is today's, drawn by the
 * date's seed (`src/daily/rules.ts`); the data is in `src/data/dailyQuests.ts` and `src/data/dailyRun.ts`.
 */
export class DailyScreen implements Screen {
  statsName = 'Daily';
  container = new Container();
  private store = getProgressStore();
  private credits = new CreditsBadge();
  private toast = new Toast();
  private buttons: UIButton[] = [];
  private body = new Container();
  private countdown = makeText('', UI.text.body, UI.color.textDim, { fontWeight: 'bold' });
  private gestures: GestureTracker | null = null;
  private builtDay = '';
  private lastCount = '';
  private rerollRects: { index: number; rect: { x: number; y: number; w: number; h: number } }[] = [];
  private startButton!: UIButton;
  private fixed: UIButton[] = [];

  constructor(private sm: ScreenManager) {
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(UI.color.page);
    const bar = new Graphics().rect(0, 0, VIEW_W, HEADER_H).fill(UI.color.panel).rect(0, HEADER_H - 1, VIEW_W, 1).fill(UI.color.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(UI.color.panel).rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(UI.color.border);
    const title = makeText('DAILY', UI.text.title, UI.color.text, { fontWeight: 'bold' });
    title.anchor.set(0, 0.5);
    title.position.set(64, 27);
    this.credits.set(this.store.data.credits);
    const back = textButton('dailyBack', { x: 6, y: 6, w: 46, h: 40 }, '<', () => backToCarousel(this.sm, 'daily'), 24);
    this.fixed.push(back);
    this.countdown.anchor.set(1, 0.5);
    this.countdown.position.set(VIEW_W - PAD, HEADER_H + 20);
    const tabs = makeTabButtons('tabMap', (id) => { if (id !== 'tabMap') goToTab(this.sm, id); });
    this.fixed.push(...tabs);
    this.container.addChild(bg, bar, title, this.credits.container, this.countdown, this.body, back.container);
    for (const t of tabs) this.container.addChild(t.container);
    this.container.addChild(this.toast.container);
    this.build();
    this.installDevHook();
  }

  /** Draws everything for today (called again after a reroll and when the day changes while the screen is open). */
  private build() {
    const d = this.store.refreshDaily();
    const today = this.store.today;
    this.builtDay = today;
    this.body.removeChildren().forEach(c => c.destroy({ children: true }));
    this.buttons = [...this.fixed];
    this.rerollRects = [];
    let y = HEADER_H + 10;
    const head = (text: string, yy: number) => { const h = makeText(text, UI.text.header, UI.color.textDim, { fontWeight: 'bold' }); h.position.set(PAD, yy); this.body.addChild(h); };

    head('TODAY\'S QUESTS', y + 10);
    y += 40;
    d.quests.forEach((q, i) => {
      const def = QUEST_BY_KIND[q.kind];
      const card = new Container();
      card.addChild(drawTileFace(new Graphics(), { x: PAD, y, w: VIEW_W - 2 * PAD, h: CARD_H }));
      const text = makeText(def.text(q.n, q.hull), UI.text.body + 2, q.done ? UI.color.good : UI.color.text, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: VIEW_W - 2 * PAD - 150 });
      text.position.set(PAD + 12, y + 8);
      // Progress bar with "x / n".
      const bx = PAD + 12, by = y + CARD_H - 28, bw = VIEW_W - 2 * PAD - 150, bh = 16;
      const share = Math.min(1, q.progress / q.n);
      const bar = new Graphics().rect(bx, by, bw, bh).fill(0x1c1c1e).stroke({ color: UI.color.border, width: 1.5 });
      if (share > 0) bar.rect(bx + 1.5, by + 1.5, Math.max(2, (bw - 3) * share), bh - 3).fill(q.done ? UI.color.good : UI.color.accent);
      const count = makeText(`${fmtBig(Math.floor(q.progress))} / ${fmtBig(q.n)}`, UI.text.small, UI.color.text, { fontWeight: 'bold' });
      count.anchor.set(0.5);
      count.position.set(bx + bw / 2, by + bh / 2);
      card.addChild(text, bar, count);
      // Reward at the right; DONE tick instead of the reroll button once finished.
      const rx = VIEW_W - PAD - 12;
      let ry = y + 22;
      if (q.cores > 0) { const a = amountLabel(`+${q.cores}`, UI.text.header, 'cores', { align: 'right' }); a.position.set(rx, ry); card.addChild(a); ry += 24; }
      if (q.medals > 0) { const a = amountLabel(`+${q.medals}`, UI.text.header, 'medals', { align: 'right' }); a.position.set(rx, ry); card.addChild(a); }
      if (q.done) {
        const t = makeText('DONE', UI.text.body, UI.color.good, { fontWeight: 'bold' });
        t.anchor.set(1, 0.5);
        t.position.set(rx, y + CARD_H - 20);
        card.addChild(t);
      } else if (!d.rerolled) {
        const rect = { x: VIEW_W - PAD - 12 - 86, y: y + CARD_H - 34, w: 86, h: 26 };
        const b = textButton(`dailyReroll${i}`, rect, 'Reroll', () => this.reroll(i), UI.text.body);
        this.buttons.push(b);
        card.addChild(b.container);
        this.rerollRects.push({ index: i, rect });
      }
      this.body.addChild(card);
      y += CARD_H + CARD_GAP;
    });
    // The bonus line.
    const bonus = new Container();
    bonus.addChild(drawTileFace(new Graphics(), { x: PAD, y, w: VIEW_W - 2 * PAD, h: 36 }));
    const bl = makeText(d.bonusPaid ? 'All three done' : `All ${DAILY_QUEST_COUNT} done: bonus`, UI.text.body, d.bonusPaid ? UI.color.good : UI.color.text, { fontWeight: 'bold' });
    bl.anchor.set(0, 0.5);
    bl.position.set(PAD + 12, y + 18);
    const bv = amountLabel(`+${DAILY_ALL_BONUS.medals ?? 0}`, UI.text.header, 'medals', { align: 'right' });
    bv.position.set(VIEW_W - PAD - 12, y + 18);
    bonus.addChild(bl, bv);
    this.body.addChild(bonus);
    y += 36 + 14;

    // The daily run.
    head('DAILY RUN', y);
    y += 26;
    const twist = twistOf(today);
    const tc = new Container();
    tc.addChild(drawTileFace(new Graphics(), { x: PAD, y, w: VIEW_W - 2 * PAD, h: 70 }));
    const tt = makeText(twist.name, UI.text.title, UI.color.accent, { fontWeight: 'bold' });
    tt.position.set(PAD + 12, y + 8);
    const tl = makeText(twist.line, UI.text.body, UI.color.text, { fontWeight: 'bold' });
    tl.position.set(PAD + 12, y + 40);
    const best = makeText(d.runBest > 0 ? `Best wave ${d.runBest}` : 'Not flown today', UI.text.body, d.runBest > 0 ? UI.color.good : UI.color.textDim, { fontWeight: 'bold' });
    best.anchor.set(1, 0);
    best.position.set(VIEW_W - PAD - 12, y + 12);
    tc.addChild(tt, tl, best);
    this.body.addChild(tc);
    y += 70 + 8;
    // Reward tiers: one chip per tier, a tick when paid today.
    const n = RUN_TIERS.length, gap = 6, cw = (VIEW_W - 2 * PAD - gap * (n - 1)) / n;
    RUN_TIERS.forEach((t, i) => {
      const x = PAD + i * (cw + gap);
      const paid = d.runPaid.includes(t.wave);
      const chip = new Container();
      chip.addChild(new Graphics().rect(x, y, cw, 56).fill(paid ? 0x2f4a37 : UI.color.tile).stroke({ color: paid ? UI.color.good : UI.color.tileEdge, width: 1.5 }));
      const w = makeText(`W${t.wave}`, UI.text.body, paid ? UI.color.good : UI.color.text, { fontWeight: 'bold' });
      w.anchor.set(0.5, 0);
      w.position.set(x + cw / 2, y + 4);
      const a = amountLabel(`${t.cores}`, UI.text.small + 1, 'cores', { align: 'center' });
      a.position.set(x + cw / 2, y + 30);
      chip.addChild(w, a);
      if (t.medals) { const m = amountLabel(`+${t.medals}`, UI.text.small, 'medals', { align: 'center' }); m.position.set(x + cw / 2, y + 46); chip.addChild(m); }
      this.body.addChild(chip);
    });
    y += 56 + 14;

    // History: the best wave of each of the last seven days.
    head('LAST 7 DAYS (BEST WAVE)', y);
    y += 24;
    const hist = historyView(d, today);
    const top = Math.max(1, ...hist.map(h => h.best));
    const hw = (VIEW_W - 2 * PAD - 6 * 8) / 7, maxH = 52;
    hist.forEach((h, i) => {
      const x = PAD + i * (hw + 8);
      const isToday = i === hist.length - 1;
      const bh = h.best > 0 ? Math.max(4, (h.best / top) * maxH) : 2;
      const g = new Graphics().rect(x, y + maxH - bh, hw, bh).fill(h.best > 0 ? (isToday ? UI.color.accent : UI.color.cores) : UI.color.border);
      const val = makeText(h.best > 0 ? String(h.best) : '-', UI.text.small, UI.color.text, { fontWeight: 'bold' });
      val.anchor.set(0.5, 0);
      val.position.set(x + hw / 2, y + maxH + 2);
      const [yy, mm, dd] = h.day.split('-').map(Number);
      const dl = makeText(WEEKDAY[new Date(yy, mm - 1, dd).getDay()], UI.text.small, isToday ? UI.color.accent : UI.color.textDim, { fontWeight: 'bold' });
      dl.anchor.set(0.5, 0);
      dl.position.set(x + hw / 2, y + maxH + 16);
      this.body.addChild(g, val, dl);
    });

    this.startButton = textButton('dailyStart', START, 'START DAILY RUN', () => this.start(), 24);
    this.buttons.push(this.startButton);
    this.body.addChild(this.startButton.container);
    this.lastCount = '';
    this.updateCountdown();
  }

  private reroll(i: number) {
    const r = this.store.rerollQuest(i);
    if (!r.ok) { this.toast.show(r.error); return; }
    this.build();
    this.toast.show('Quest rerolled (one a day)');
  }

  start() {
    const r = startDailyRun(this.sm);
    if (r === 'noEjector') this.toast.show(NO_EJECTOR_TEXT);
  }

  private updateCountdown() {
    const text = `New day in ${fmtCountdown(nextMidnight(gameNow()) - gameNow())}`;
    if (text !== this.lastCount) { this.lastCount = text; this.countdown.text = text; }
  }

  init() {
    mapMemory().setOpen('daily');
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

  update(dt: number) {
    this.toast.update(dt * 1000);
    this.updateCountdown();
    // The day turned over while the screen was open (local midnight, or the debug "Next day"): draw the new day.
    if (this.store.today !== this.builtDay) this.build();
  }

  destroy() {
    this.gestures?.detach();
    this.container.destroy({ children: true });
  }

  private installDevHook() {
    if (!DEBUG_ON) return;
    (window as any).__mgbm = {
      screen: 'daily',
      state: () => {
        const d = this.store.data.daily;
        return {
          day: d.day, today: this.store.today, quests: d.quests.map(q => ({ ...q, text: QUEST_BY_KIND[q.kind].text(q.n, q.hull) })), rerolled: d.rerolled, bonusPaid: d.bonusPaid,
          twist: twistOf(this.store.today).id, runBest: d.runBest, runPaid: d.runPaid, history: historyView(d, this.store.today), countdown: this.countdown.text, toast: this.toast.message,
        };
      },
      buttonRect: (id: string) => this.buttons.find(b => b.id === id)?.rect,
      start: () => this.start(),
      reroll: (i: number) => this.reroll(i),
    };
  }
}
