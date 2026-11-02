import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { CaptainScreen } from './CaptainScreen';
import { ShopScreen } from './ShopScreen';
import { MapScreen } from './MapScreen';
import { SkillsScreen } from './SkillsScreen';
import { GestureTracker } from '../builder/gestures';
import { inRect, LAYOUT, Rect, VIEW_H, VIEW_W } from '../builder/layout';
import { makeTabButtons } from '../builder/tabs';
import { makeText, Toast, UIButton } from '../builder/ui';
import { getProgressStore } from '../econ/progress';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from '../data/achievements';
import { CHALLENGES } from '../data/challenges';
import { progressOf, rewardText } from '../achievements/rules';
import { challengeCounts, challengeDone, challengeRewardText, challengeUnlocked, ruleLines } from '../challenges/rules';
import { startChallengeSession } from '../challenges/session';
import { fmtBig } from '../ui/format';
import { THEME } from '../ui/theme';
import { DEBUG_ON } from '../debug/enabled';

const TOP = 52;
const SEG_H = 44;
const LIST_TOP = TOP + SEG_H;
const BOTTOM = LAYOUT.tabs.y;
const PAD = 8;
const W = VIEW_W - 2 * PAD;
const GAP = 8;
const ACH_H = 88;
const GROUP_H = 34;
const BAR_H = 8;
const EARNED = THEME.good;

export type AchView = 'achievements' | 'challenges';

interface Hit { id: string; rect: Rect; enabled: boolean; act: () => void; fixed?: boolean }

/**
 * Chunk 28a: the Achievements panel (reached from the Captain tab) with two views: the achievements by group, each with a progress bar, and
 * the challenges, each a campaign tier with a rule and a Start button. Everything is read from the two data files and the save.
 */
export class AchievementsScreen implements Screen {
  statsName = 'Achievements';
  container = new Container();
  private store = getProgressStore();
  private toast = new Toast();
  private tabs: UIButton[] = [];
  private listC = new Container();
  private fixedC = new Container();
  private mask = new Graphics();
  private gestures: GestureTracker | null = null;
  private unsubscribe: (() => void) | null = null;
  view: AchView;
  scrollY = 0;
  private contentH = 0;
  private hits: Hit[] = [];

  constructor(private sm: ScreenManager, view: AchView = 'achievements') {
    this.view = view;
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(THEME.bg);
    const bar = new Graphics()
      .rect(0, 0, VIEW_W, TOP).fill(THEME.panel).rect(0, TOP - 1, VIEW_W, 1).fill(THEME.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(THEME.panel)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(THEME.border);
    const title = makeText('Achievements', 28, THEME.text, { fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 27);
    this.mask.rect(0, LIST_TOP, VIEW_W, BOTTOM - LIST_TOP).fill(0xffffff);
    this.listC.mask = this.mask;
    this.container.addChild(bg, this.listC, this.fixedC, bar, title);
    this.tabs = makeTabButtons('tabCaptain', (id) => this.tapTab(id));
    for (const b of this.tabs) this.container.addChild(b.container);
    this.container.addChild(this.toast.container, this.mask);
    this.rebuild();
    this.installDevHook();
  }

  init() {
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => this.tap(x, y),
        onDrag: (_dx, dy) => this.scrollBy(-dy),
        onPinch: () => {},
        onWheel: (dy, x, y) => { if (this.inList(x, y)) this.scrollBy(dy); },
        canDrag: (x, y) => this.inList(x, y),
      },
    );
    this.gestures.attach();
    this.unsubscribe = this.store.onChange(() => this.rebuild());
  }

  destroy() {
    this.gestures?.detach();
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }

  update(dt: number) { this.toast.update(dt * 1000); }

  // ------------------------------------------------------------------ scrolling and taps
  private inList(x: number, y: number) { return y >= LIST_TOP && y < BOTTOM && x >= 0 && x < VIEW_W; }
  private screenRect(h: Hit): Rect { return h.fixed ? h.rect : { x: h.rect.x, y: LIST_TOP + h.rect.y - this.scrollY, w: h.rect.w, h: h.rect.h }; }

  private applyScroll() {
    this.scrollY = Math.max(0, Math.min(Math.max(0, this.contentH - (BOTTOM - LIST_TOP)), this.scrollY));
    this.listC.position.set(0, LIST_TOP - this.scrollY);
  }

  scrollBy(dy: number) { this.scrollY += dy; this.applyScroll(); }

  private tap(x: number, y: number) {
    for (const b of this.tabs) if (b.hit(x, y)) { b.flash(); b.spec.onTap(); return; }
    const inMask = y >= LIST_TOP && y < BOTTOM;
    for (const h of this.hits) {
      if (!h.fixed && !inMask) continue;
      if (inRect(this.screenRect(h), x, y)) { if (h.enabled) h.act(); return; }
    }
  }

  private tapTab(id: string) {
    if (id === 'tabCaptain') { this.sm.switchTo(new CaptainScreen(this.sm)); return; }
    if (id === 'tabBuild') { this.sm.switchTo(new BuildScreen(this.sm)); return; }
    if (id === 'tabShop') { this.sm.switchTo(new ShopScreen(this.sm)); return; }
    if (id === 'tabMap') { this.sm.switchTo(new MapScreen(this.sm)); return; }
    if (id === 'tabSkills') { this.sm.switchTo(new SkillsScreen(this.sm)); return; }
  }

  show(v: AchView) { this.view = v; this.scrollY = 0; this.rebuild(); }

  // ------------------------------------------------------------------ drawing
  private rebuild() {
    for (const ch of this.listC.removeChildren()) ch.destroy({ children: true });
    for (const ch of this.fixedC.removeChildren()) ch.destroy({ children: true });
    this.hits = [];
    this.drawSegments();
    if (this.view === 'achievements') this.drawAchievements(); else this.drawChallenges();
    this.applyScroll();
  }

  private label(layer: Container, text: string, x: number, y: number, size: number, color: number, wrap = 0, anchorX = 0) {
    const t = makeText(text, size, color, { fontWeight: 'bold', ...(wrap ? { wordWrap: true, wordWrapWidth: wrap, lineHeight: size + 4 } : {}) });
    t.anchor.set(anchorX, 0);
    t.position.set(x, y);
    layer.addChild(t);
    return t;
  }

  private box(layer: Container, r: Rect, border: number = THEME.border, fill: number = THEME.panel) {
    layer.addChild(new Graphics().rect(r.x, r.y, r.w, r.h).fill(fill).stroke({ color: border, width: 1.5 }));
  }

  private button(layer: Container, id: string, r: Rect, text: string, enabled: boolean, act: () => void, opts: { fixed?: boolean; size?: number; selected?: boolean } = {}) {
    const g = new Graphics().rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).fill(opts.selected ? THEME.pressedFill : THEME.buttonFill).stroke({ color: enabled ? THEME.buttonLine : THEME.disabled, width: 1.5 });
    const t = makeText(text, opts.size ?? 15, opts.selected ? THEME.pressedIcon : enabled ? THEME.text : THEME.disabled, { fontWeight: 'bold', align: 'center' });
    t.anchor.set(0.5);
    t.position.set(r.x + r.w / 2, r.y + r.h / 2);
    layer.addChild(g, t);
    this.hits.push({ id, rect: r, enabled, act, fixed: opts.fixed });
  }

  /** Back, and the two views. */
  private drawSegments() {
    const L = this.fixedC;
    this.button(L, 'back', { x: 6, y: 6, w: 46, h: 40 }, '<', true, () => this.sm.switchTo(new CaptainScreen(this.sm)), { fixed: true, size: 24 });
    const half = (VIEW_W - 2 * PAD - GAP) / 2;
    const p = this.store.data;
    const earned = p.achievements.length;
    const cc = challengeCounts(p);
    this.button(L, 'viewAchievements', { x: PAD, y: TOP + 4, w: half, h: SEG_H - 8 }, `Achievements ${earned} / ${ACHIEVEMENTS.length}`, true, () => this.show('achievements'), { fixed: true, selected: this.view === 'achievements' });
    this.button(L, 'viewChallenges', { x: PAD + half + GAP, y: TOP + 4, w: half, h: SEG_H - 8 }, `Challenges ${cc.done} / ${cc.total}`, true, () => this.show('challenges'), { fixed: true, selected: this.view === 'challenges' });
    const m = this.label(L, `Medals ${p.medals}`, VIEW_W - 12, 14, 20, THEME.currency, 0, 1);
    m.anchor.set(1, 0);
  }

  private drawAchievements() {
    const p = this.store.data;
    const L = this.listC;
    let y = PAD;
    for (const group of ACHIEVEMENT_GROUPS) {
      const list = ACHIEVEMENTS.filter(a => a.group === group);
      const done = list.filter(a => p.achievements.includes(a.id)).length;
      this.label(L, `${group}`, PAD + 2, y + 6, 18, THEME.text);
      this.label(L, `${done} / ${list.length}`, VIEW_W - PAD - 2, y + 8, 14, THEME.textDim, 0, 1).anchor.set(1, 0);
      y += GROUP_H;
      for (const a of list) {
        const earned = p.achievements.includes(a.id);
        const pr = progressOf(p, a);
        const r: Rect = { x: PAD, y, w: W, h: ACH_H };
        const secret = !!a.hidden && !earned;
        this.box(L, r, earned ? EARNED : THEME.border);
        this.label(L, secret ? '???' : a.name, r.x + 12, r.y + 8, 18, earned ? THEME.text : secret ? THEME.textDim : THEME.text);
        this.label(L, secret ? (a.hint ?? 'Hidden.') : a.text, r.x + 12, r.y + 31, 13, THEME.textDim, W - 24);
        if (earned) this.label(L, 'EARNED', r.x + r.w - 12, r.y + 10, 15, EARNED, 0, 1).anchor.set(1, 0);
        else if (!secret) this.label(L, `${fmtBig(pr.value)} / ${fmtBig(pr.goal)}`, r.x + r.w - 12, r.y + 10, 15, THEME.textDim, 0, 1).anchor.set(1, 0);
        const barW = r.w - 24;
        L.addChild(new Graphics().rect(r.x + 12, r.y + 56, barW, BAR_H).fill(THEME.border));
        const frac = earned ? 1 : secret ? 0 : pr.goal > 0 ? pr.value / pr.goal : 0;
        if (frac > 0) L.addChild(new Graphics().rect(r.x + 12, r.y + 56, Math.max(2, barW * Math.min(1, frac)), BAR_H).fill(earned ? EARNED : THEME.currency));
        this.label(L, `Reward: ${rewardText(a.reward)}`, r.x + 12, r.y + 68, 12, THEME.currency);
        y += ACH_H + GAP;
      }
      y += 4;
    }
    this.contentH = y + PAD;
  }

  private drawChallenges() {
    const p = this.store.data;
    const L = this.listC;
    let y = PAD;
    this.label(L, 'Each challenge is a campaign tier with a rule. It opens when you pass the tier; the reward is paid once.', PAD + 2, y, 13, THEME.textDim, W - 4);
    y += 40;
    const sorted = [...CHALLENGES].sort((a, b) => a.tier - b.tier);
    for (const c of sorted) {
      const open = challengeUnlocked(p, c);
      const done = challengeDone(p, c.id);
      const lines = open ? ruleLines(c) : [`Locked: pass tier ${c.tier} first`];
      const texts = lines.map(ln => makeText(ln, 13, open ? THEME.textDim : THEME.disabled, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: W - 140, lineHeight: 17 }));
      const bodyH = texts.reduce((n, t) => n + t.height + 2, 0);
      const h = Math.max(92, 32 + bodyH + 28);
      const r: Rect = { x: PAD, y, w: W, h };
      this.box(L, r, done ? EARNED : THEME.border, open ? THEME.panel : THEME.bg);
      this.label(L, c.name, r.x + 12, r.y + 8, 18, open ? THEME.text : THEME.textDim);
      let ty = r.y + 32;
      for (const t of texts) { t.position.set(r.x + 12, ty); L.addChild(t); ty += t.height + 2; }
      this.label(L, `Reward: ${challengeRewardText(c)}`, r.x + 12, r.y + h - 22, 12, THEME.currency);
      if (done) this.label(L, 'DONE', r.x + r.w - 12, r.y + 10, 15, EARNED, 0, 1).anchor.set(1, 0);
      const btn: Rect = { x: r.x + r.w - 112, y: r.y + h - 48, w: 100, h: 38 };
      this.button(L, `start:${c.id}`, btn, done ? 'Again' : 'Start', open, () => this.startChallenge(c.id), { size: 16 });
      y += h + GAP;
    }
    this.contentH = y + PAD;
  }

  private startChallenge(id: string) {
    startChallengeSession(id);
    this.sm.switchTo(new BuildScreen(this.sm));
  }

  private installDevHook() {
    if (!DEBUG_ON) return;
    (window as any).__mgbm = {
      screen: 'achievements',
      achievementsScreen: this,
      state: () => ({
        view: this.view, scrollY: this.scrollY, contentH: this.contentH,
        buttons: this.hits.map(h => ({ id: h.id, enabled: h.enabled, rect: this.screenRect(h) })),
      }),
    };
  }
}
