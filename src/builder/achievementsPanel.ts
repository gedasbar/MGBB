import { Container, Graphics } from 'pixi.js';
import { inRect, Rect } from './layout';
import { makeText } from './ui';
import { getProgressStore } from '../econ/progress';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from '../data/achievements';
import { CHALLENGES } from '../data/challenges';
import { progressOf, rewardText } from '../achievements/rules';
import { challengeCounts, challengeDone, challengeRewardText, challengeUnlocked, ruleLines } from '../challenges/rules';
import { fmtBig } from '../ui/format';
import { THEME, UI } from '../ui/theme';
import { drawButtonFace, drawCheckbox, drawSegmented, faceTextColor, segmentRects } from '../ui/widgets';
import { sfx } from '../audio';
import { drawHubFrame, hubBodyRect, hubTabAt, HubTab, HUB_PANEL, HUB_TAB_H } from './hub';

const PAD = UI.space.m;
const GAP = UI.space.s;
const SEG_H = UI.control.segment;
const BOX = UI.control.checkbox;
/** The switch row (Achievements / Challenges + the "show completed" checkbox) sits one spacing step below the hub's tab strip; then a Medals line. */
const SEG_Y = UI.space.m;
const MEDALS_H = 26;
/** Top of the scrolling list below the switch row and the Medals line (local to the body). */
const LIST_TOP = SEG_Y + SEG_H + MEDALS_H + UI.space.xs;
const ACH_H = 88;
const GROUP_H = 34;
const BAR_H = 8;
const EARNED = THEME.good;

export type AchView = 'achievements' | 'challenges';

interface Hit { id: string; rect: Rect; enabled: boolean; act: () => void; fixed?: boolean }

/** What the owner (the Build screen) hands the panel. */
export interface AchievementsPanelEvents {
  /** Another tab of the hub was tapped. */
  tab(t: HubTab): void;
  /** A challenge's Start button: the owner starts the session and closes the hub. */
  start(id: string): void;
}

/**
 * Chunk 28b: the ACHIEVEMENTS tab of the hub (it was a screen reached from the Captain tab in 28a). Two views, Achievements by group with progress bars and Challenges with
 * Start buttons, and a "Show completed" switch (default off, remembered in the settings): with it off the finished entries are hidden, with it on they are listed at the
 * bottom of their group. Everything is read from the two data files and the save.
 */
export class AchievementsPanel {
  readonly container = new Container();
  isOpen = false;
  view: AchView = 'achievements';
  scrollY = 0;
  private contentH = 0;
  private listC = new Container();
  private fixedC = new Container();
  private maskG = new Graphics();
  private hits: Hit[] = [];
  private unsubscribe: (() => void) | null = null;
  /** What the list shows now, for tests and the e2e hook. */
  rows: { id: string; title: string; text: string; earned: boolean; open: boolean; value: number; goal: number }[] = [];

  constructor(private events: AchievementsPanelEvents) {
    this.container.visible = false;
  }

  private get body(): Rect { return hubBodyRect(); }
  private get listRect(): Rect { const b = this.body; return { x: b.x, y: b.y + LIST_TOP, w: b.w, h: b.h - LIST_TOP }; }
  get showCompleted(): boolean { return sfx.settings.showCompleted === true; }

  open(view?: AchView) {
    this.isOpen = true;
    if (view) this.view = view;
    this.scrollY = 0;
    this.container.visible = true;
    this.unsubscribe?.();
    this.unsubscribe = getProgressStore().onChange(() => this.refresh());
    this.refresh();
  }

  close() {
    this.isOpen = false;
    this.container.visible = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  show(v: AchView) { this.view = v; this.scrollY = 0; this.refresh(); }

  setShowCompleted(on: boolean) { sfx.set('showCompleted', on); this.scrollY = 0; this.refresh(); }

  // ------------------------------------------------------------------ scrolling and taps
  inList(x: number, y: number): boolean { return this.isOpen && inRect(this.listRect, x, y); }

  private applyScroll() {
    const lr = this.listRect;
    this.scrollY = Math.max(0, Math.min(Math.max(0, this.contentH - lr.h), this.scrollY));
    this.listC.position.set(lr.x, lr.y - this.scrollY);
  }

  scrollBy(dy: number) { this.scrollY += dy; this.applyScroll(); }

  /** Screen rectangle of a hit (content hits move with the scroll). */
  private screenRect(h: Hit): Rect {
    const b = this.body;
    return h.fixed ? { x: b.x + h.rect.x, y: b.y + h.rect.y, w: h.rect.w, h: h.rect.h } : { x: b.x + h.rect.x, y: this.listRect.y + h.rect.y - this.scrollY, w: h.rect.w, h: h.rect.h };
  }

  /** Handles a tap while the tab is open; always consumes it. */
  tap(x: number, y: number) {
    if (!inRect(HUB_PANEL, x, y)) { this.close(); return; }
    if (y < HUB_PANEL.y + HUB_TAB_H) { const t = hubTabAt(x, y); if (t && t !== 'ach') this.events.tab(t); return; }
    const inListRect = inRect(this.listRect, x, y);
    for (const h of this.hits) {
      if (!h.fixed && !inListRect) continue;
      if (inRect(this.screenRect(h), x, y)) { if (h.enabled) h.act(); return; }
    }
  }

  /** Screen rectangle of a button by id, scrolled into view first (tests). */
  buttonRect(id: string): Rect | null {
    const h = this.hits.find(hh => hh.id === id);
    if (!h) return null;
    if (!h.fixed) {
      const lr = this.listRect;
      if (h.rect.y < this.scrollY) this.scrollBy(h.rect.y - this.scrollY - 8);
      else if (h.rect.y + h.rect.h > this.scrollY + lr.h) this.scrollBy(h.rect.y + h.rect.h - this.scrollY - lr.h + 8);
    }
    return this.screenRect(h);
  }

  // ------------------------------------------------------------------ drawing
  refresh() {
    if (!this.isOpen) return;
    for (const ch of this.container.removeChildren()) if (ch !== this.listC && ch !== this.fixedC && ch !== this.maskG) ch.destroy({ children: true });
    for (const ch of this.listC.removeChildren()) ch.destroy({ children: true });
    for (const ch of this.fixedC.removeChildren()) ch.destroy({ children: true });
    this.hits = [];
    this.rows = [];
    const frame = new Container();
    drawHubFrame(frame, 'ach');
    this.container.addChild(frame, this.listC, this.fixedC);
    const lr = this.listRect;
    this.maskG.clear().rect(lr.x, lr.y, lr.w, lr.h).fill(0xffffff);
    this.listC.mask = this.maskG;
    this.container.addChild(this.maskG);
    this.drawControls();
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

  private box(layer: Container, r: Rect, border: number = THEME.border, fill: number = UI.color.tile) {
    layer.addChild(new Graphics().rect(r.x, r.y, r.w, r.h).fill(fill).stroke({ color: border === THEME.border ? UI.color.tileEdge : border, width: UI.stroke.thin }));
  }

  /** A button drawn into `layer` at `r` (local to the body for fixed ones, to the list's content for the others). */
  private button(layer: Container, id: string, r: Rect, text: string, enabled: boolean, act: () => void, opts: { fixed?: boolean; size?: number; selected?: boolean } = {}) {
    const b = opts.fixed ? this.body : { x: 0, y: 0 };
    const g = drawButtonFace(new Graphics(), { x: b.x + r.x, y: b.y + r.y, w: r.w, h: r.h }, { selected: opts.selected, enabled });
    const t = makeText(text, opts.size ?? UI.text.body + 1, faceTextColor({ selected: opts.selected, enabled }), { fontWeight: 'bold', align: 'center' });
    t.anchor.set(0.5);
    t.position.set(b.x + r.x + r.w / 2, b.y + r.y + r.h / 2);
    layer.addChild(g, t);
    this.hits.push({ id, rect: r, enabled, act, fixed: opts.fixed });
  }

  /** The Achievements / Challenges segmented control (shared style) with the small "show completed" checkbox beside it, and the Medals line (body-local, fixed above the list). */
  private drawControls() {
    const L = this.fixedC;
    const w = HUB_PANEL.w;
    const p = getProgressStore().data;
    const cc = challengeCounts(p);
    const b = this.body;
    const segW = w - 2 * PAD - GAP - BOX;
    const seg: Rect = { x: b.x + PAD, y: b.y + SEG_Y, w: segW, h: SEG_H };
    const active = this.view === 'achievements' ? 0 : 1;
    L.addChild(drawSegmented(new Graphics(), seg, active, 2));
    const names = [`Achievements ${p.achievements.length} / ${ACHIEVEMENTS.length}`, `Challenges ${cc.done} / ${cc.total}`];
    segmentRects(seg, 2).forEach((r, i) => {
      const t = makeText(names[i], UI.text.body, i === active ? UI.color.onSelected : UI.color.text, { fontWeight: 'bold' });
      t.anchor.set(0.5);
      t.position.set(r.x + r.w / 2, r.y + r.h / 2);
      L.addChild(t);
      this.hits.push({ id: i === 0 ? 'viewAchievements' : 'viewChallenges', rect: { x: r.x - b.x, y: r.y - b.y, w: r.w, h: r.h }, enabled: true, act: () => this.show(i === 0 ? 'achievements' : 'challenges'), fixed: true });
    });
    // The checkbox: ticked = finished entries are shown. Same height as the switch so the row reads as one.
    const cb: Rect = { x: b.x + w - PAD - BOX, y: b.y + SEG_Y + (SEG_H - BOX) / 2, w: BOX, h: BOX };
    L.addChild(drawCheckbox(new Graphics(), cb, this.showCompleted));
    this.hits.push({ id: 'showCompleted', rect: { x: cb.x - b.x, y: cb.y - b.y, w: cb.w, h: cb.h }, enabled: true, act: () => this.setShowCompleted(!this.showCompleted), fixed: true });
    const rowY = b.y + SEG_Y + SEG_H + UI.space.xs;
    this.label(L, `Medals ${p.medals}`, b.x + PAD + 2, rowY, UI.text.header, UI.color.accent);
    const d = this.label(L, 'Done', cb.x + cb.w / 2, rowY + 2, UI.text.small, UI.color.textDim);
    d.anchor.set(0.5, 0);
  }

  private drawAchievements() {
    const p = getProgressStore().data;
    const L = this.listC;
    const W = HUB_PANEL.w - 2 * PAD;
    let y = PAD;
    let shown = 0;
    for (const group of ACHIEVEMENT_GROUPS) {
      const all = ACHIEVEMENTS.filter(a => a.group === group);
      const done = all.filter(a => p.achievements.includes(a.id)).length;
      // Finished ones are hidden, or (Show completed) listed after the unfinished ones.
      const list = all.filter(a => this.showCompleted || !p.achievements.includes(a.id)).sort((a, b) => Number(p.achievements.includes(a.id)) - Number(p.achievements.includes(b.id)));
      if (list.length === 0) continue;
      this.label(L, `${group}`, PAD + 2, y + 6, 18, THEME.text);
      this.label(L, `${done} / ${all.length}`, HUB_PANEL.w - PAD - 2, y + 8, 14, THEME.textDim, 0, 1).anchor.set(1, 0);
      y += GROUP_H;
      for (const a of list) {
        shown++;
        const earned = p.achievements.includes(a.id);
        const pr = progressOf(p, a);
        const r: Rect = { x: PAD, y, w: W, h: ACH_H };
        const secret = !!a.hidden && !earned;
        this.box(L, r, earned ? EARNED : THEME.border);
        this.rows.push({ id: a.id, title: secret ? '???' : a.name, text: secret ? (a.hint ?? 'Hidden.') : a.text, earned, open: true, value: pr.value, goal: pr.goal });
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
    if (shown === 0) this.label(L, 'All done', PAD + 2, y + 8, UI.text.header, UI.color.textDim);
    this.contentH = y + PAD + (shown === 0 ? 40 : 0);
  }

  private drawChallenges() {
    const p = getProgressStore().data;
    const L = this.listC;
    const W = HUB_PANEL.w - 2 * PAD;
    let y = PAD;
    const sorted = CHALLENGES.filter(c => this.showCompleted || !challengeDone(p, c.id)).sort((a, b) => Number(challengeDone(p, a.id)) - Number(challengeDone(p, b.id)) || a.tier - b.tier);
    if (sorted.length === 0) { this.label(L, 'All done', PAD + 2, y, UI.text.header, UI.color.textDim); y += 40; }
    for (const c of sorted) {
      const open = challengeUnlocked(p, c);
      const done = challengeDone(p, c.id);
      const lines = open ? ruleLines(c) : [`Locked · tier ${c.tier}`];
      const texts = lines.map(ln => makeText(ln, 13, open ? THEME.textDim : THEME.disabled, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: W - 140, lineHeight: 17 }));
      const bodyH = texts.reduce((n, t) => n + t.height + 2, 0);
      const h = Math.max(92, 32 + bodyH + 28);
      const r: Rect = { x: PAD, y, w: W, h };
      this.box(L, r, done ? EARNED : THEME.border, open ? UI.color.tile : UI.color.panel);
      this.rows.push({ id: c.id, title: c.name, text: lines.join(' | '), earned: done, open, value: 0, goal: 0 });
      this.label(L, c.name, r.x + 12, r.y + 8, 18, open ? THEME.text : THEME.textDim);
      let ty = r.y + 32;
      for (const t of texts) { t.position.set(r.x + 12, ty); L.addChild(t); ty += t.height + 2; }
      this.label(L, `Reward: ${challengeRewardText(c)}`, r.x + 12, r.y + h - 22, 12, THEME.currency);
      if (done) this.label(L, 'DONE', r.x + r.w - 12, r.y + 10, 15, EARNED, 0, 1).anchor.set(1, 0);
      const btn: Rect = { x: r.x + r.w - 112, y: r.y + h - 48, w: 100, h: 38 };
      this.button(L, `start:${c.id}`, btn, done ? 'Again' : 'Start', open, () => this.events.start(c.id), { size: 16 });
      y += h + GAP;
    }
    this.contentH = y + PAD;
  }

  /** The state the e2e hook and tests read. */
  state() {
    return {
      isOpen: this.isOpen, view: this.view, scrollY: this.scrollY, contentH: this.contentH, showCompleted: this.showCompleted, rows: this.rows,
      buttons: this.hits.map(h => ({ id: h.id, enabled: h.enabled, rect: this.screenRect(h) })),
    };
  }
}
