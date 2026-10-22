import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { ShopScreen } from './ShopScreen';
import { MapScreen } from './MapScreen';
import { GestureTracker } from '../builder/gestures';
import { getBuilderModel } from '../builder/session';
import { inRect, LAYOUT, Rect, VIEW_H, VIEW_W } from '../builder/layout';
import { makeTabButtons } from '../builder/tabs';
import { sfx } from '../audio';
import { makeText, Toast, UIButton } from '../builder/ui';
import { CAPTAINS, CaptainDef, CAPTAIN_BY_ID, describeOption, HERO_LEVEL_BASE_DAMAGE, heroLevelCost, TIER_COUNT } from '../captains/data';
import {
  isCaptainOwned, nextTierGoal, optionCost, optionState, tierKillsNeeded, isTierUnlocked,
} from '../captains/state';
import { drawEmblem } from '../ui/captainArt';
import { THEME } from '../ui/theme';
import { fmtBig, fmtDamage } from '../ui/format';

/** The content area between the top bar and the tabs. */
const TOP = 52;
const BOTTOM = LAYOUT.tabs.y;
/** Detail view: a fixed header (Back + name), then the scrolling list. */
const HEAD_H = 48;
const LIST_TOP = TOP + HEAD_H;
const PAD = 8;
const W = VIEW_W - 2 * PAD;
/** Card grid of the list view. */
const CARD_W = (W - 8) / 2;
const CARD_H = 200;
const CARD_Y0 = TOP + 44;

type View = 'list' | 'detail';

/** One tappable thing, in content coordinates (the list scrolls; the fixed ones are in screen coordinates). */
interface Hit { id: string; rect: Rect; enabled: boolean; label: string; act: () => void; fixed?: boolean }

/**
 * The Captain tab (chunk 13a). List view: one card per captain. Detail view: the captain's identity, hero level, lifetime
 * kills with progress to the next tier, and the four tiers with two options each. Everything is previewable; only owned
 * captains can be made active, levelled or have options bought.
 */
export class CaptainScreen implements Screen {
  statsName = 'Captain';
  container = new Container();
  private model = getBuilderModel();
  private store = this.model.store;
  private toast = new Toast();
  private tabs: UIButton[] = [];
  private listC = new Container();
  private mask = new Graphics();
  private fixedC = new Container();
  private medalsText = makeText('', 22, THEME.currency, { fontWeight: 'bold' });
  private activeText = makeText('', 14, THEME.textDim, { fontWeight: 'bold' });
  private gestures: GestureTracker | null = null;
  private unsubscribe: (() => void) | null = null;

  view: View = 'list';
  selected: string = this.store.data.captains.selected;
  scrollY = 0;
  private contentH = 0;
  private hits: Hit[] = [];

  constructor(private sm: ScreenManager) {
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(THEME.bg);
    const top = LAYOUT.top;
    const bar = new Graphics()
      .rect(top.x, top.y, top.w, top.h).fill(THEME.panel).rect(0, top.h - 1, VIEW_W, 1).fill(THEME.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(THEME.panel)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(THEME.border);
    const title = makeText('Captain', 30, THEME.text, { fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(VIEW_W / 2, 27);
    this.medalsText.anchor.set(0, 0.5);
    this.medalsText.position.set(12, 27);
    this.activeText.anchor.set(1, 0.5);
    this.activeText.position.set(VIEW_W - 12, 27);

    this.mask.rect(0, LIST_TOP, VIEW_W, BOTTOM - LIST_TOP).fill(0xffffff);
    this.container.addChild(bg, this.listC, this.fixedC, bar, title, this.medalsText, this.activeText);
    this.tabs = makeTabButtons('tabCaptain', (id) => this.tapTab(id));
    for (const b of this.tabs) this.container.addChild(b.container);
    this.container.addChild(this.toast.container);
    this.container.addChild(this.mask);

    this.rebuild();
    this.installDevHook();
  }

  // ------------------------------------------------------------------ lifecycle
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

  update(dt: number) {
    this.toast.update(dt * 1000);
  }

  private installDevHook() {
    if (!import.meta.env.DEV) return;
    (window as any).__mgbm = {
      screen: 'captain',
      captainScreen: this,
      state: () => ({
        view: this.view, selected: this.selected, scrollY: this.scrollY, contentH: this.contentH, toast: this.toast.message,
        medals: this.store.data.medals, medalsText: this.medalsText.text, activeText: this.activeText.text,
        buttons: this.hits.map(h => ({ id: h.id, enabled: h.enabled, label: h.label, rect: this.screenRect(h) })),
      }),
    };
  }

  // ------------------------------------------------------------------ scrolling and hit testing
  private inList(x: number, y: number) {
    return this.view === 'detail' && y >= LIST_TOP && y < BOTTOM && x >= 0 && x < VIEW_W;
  }

  /** Screen rectangle of a hit (fixed ones are already in screen coordinates). */
  private screenRect(h: Hit): Rect {
    return h.fixed ? h.rect : { x: h.rect.x, y: LIST_TOP + h.rect.y - this.scrollY, w: h.rect.w, h: h.rect.h };
  }

  private applyScroll() {
    const max = Math.max(0, this.contentH - (BOTTOM - LIST_TOP));
    this.scrollY = Math.max(0, Math.min(max, this.scrollY));
    this.listC.position.set(0, this.view === 'detail' ? LIST_TOP - this.scrollY : 0);
  }

  scrollBy(dy: number) {
    this.scrollY += dy;
    this.applyScroll();
  }

  private tap(x: number, y: number) {
    for (const b of this.tabs) if (b.hit(x, y)) { b.flash(); b.spec.onTap(); return; }
    // The list scrolls under a mask: taps above its top edge must not reach rows that are scrolled out of sight.
    const inMask = y >= LIST_TOP && y < BOTTOM;
    for (const h of this.hits) {
      if (!h.fixed && this.view === 'detail' && !inMask) continue;
      if (inRect(this.screenRect(h), x, y)) { h.act(); return; }
    }
  }

  private tapTab(id: string) {
    if (id === 'tabCaptain') { if (this.view === 'detail') this.show('list'); return; }
    if (id === 'tabBuild') { this.sm.switchTo(new BuildScreen(this.sm)); return; }
    if (id === 'tabShop') { this.sm.switchTo(new ShopScreen(this.sm)); return; }
    if (id === 'tabMap') { this.sm.switchTo(new MapScreen(this.sm)); return; }
    this.toast.show('Coming soon');
  }

  private show(v: View, id?: string) {
    this.view = v;
    if (id) this.selected = id;
    this.scrollY = 0;
    this.rebuild();
  }

  // ------------------------------------------------------------------ drawing
  private clear() {
    for (const ch of this.listC.removeChildren()) ch.destroy({ children: true });
    for (const ch of this.fixedC.removeChildren()) ch.destroy({ children: true });
    this.hits = [];
  }

  private rebuild() {
    this.clear();
    const p = this.store.data;
    this.medalsText.text = `Medals ${p.medals}`;
    const act = CAPTAIN_BY_ID[p.captains.selected];
    this.activeText.text = `Active: ${act?.name ?? p.captains.selected}`;
    this.activeText.style.fill = act?.accent ?? THEME.textDim;
    if (this.view === 'list') this.drawList(); else this.drawDetail();
    this.listC.mask = this.view === 'detail' ? this.mask : null;
    this.mask.visible = this.view === 'detail';
    this.applyScroll();
  }

  private panel(layer: Container, r: Rect, border: number = THEME.border, width = 1.5) {
    const g = new Graphics().rect(r.x, r.y, r.w, r.h).fill(THEME.panel).stroke({ color: border, width });
    layer.addChild(g);
  }

  private label(layer: Container, text: string, x: number, y: number, size: number, color: number, wrap = 0, anchorX = 0): ReturnType<typeof makeText> {
    const t = makeText(text, size, color, { fontWeight: 'bold', ...(wrap ? { wordWrap: true, wordWrapWidth: wrap, breakWords: true } : {}) });
    t.anchor.set(anchorX, 0);
    t.position.set(x, y);
    layer.addChild(t);
    return t;
  }

  /** A sharp rectangular button face with a centred label; registers the hit. */
  private button(layer: Container, id: string, r: Rect, label: string, enabled: boolean, act: () => void, opts: { fixed?: boolean; size?: number; accent?: number } = {}) {
    const g = new Graphics();
    g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).fill(THEME.buttonFill).stroke({ color: enabled ? (opts.accent ?? THEME.buttonLine) : THEME.disabled, width: 1.5 });
    const t = makeText(label, opts.size ?? 14, enabled ? THEME.text : THEME.disabled, { fontWeight: 'bold', align: 'center' });
    t.anchor.set(0.5);
    t.position.set(r.x + r.w / 2, r.y + r.h / 2);
    layer.addChild(g, t);
    this.hits.push({ id, rect: r, enabled, label, act, fixed: opts.fixed });
  }

  private statusLine(def: CaptainDef): { text: string; color: number } {
    const c = this.store.data.captains;
    if (c.selected === def.id) return { text: 'ACTIVE', color: THEME.good };
    if (isCaptainOwned(c, def.id)) return { text: 'Owned', color: THEME.text };
    return { text: `Locked - ${def.unlockCost} Medals`, color: THEME.currency };
  }

  // ---- list view
  private drawList() {
    const c = this.store.data.captains;
    this.label(this.listC, 'Tap a captain to see its upgrades. All of them can be previewed.', PAD, TOP + 12, 14, THEME.textDim, W);
    CAPTAINS.forEach((def, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const r: Rect = { x: PAD + col * (CARD_W + 8), y: CARD_Y0 + row * (CARD_H + 8), w: CARD_W, h: CARD_H };
      const hero = c.heroes[def.id];
      const owned = isCaptainOwned(c, def.id);
      const isActive = c.selected === def.id;
      this.panel(this.listC, r, isActive ? def.accent : THEME.border, isActive ? 3 : 1.5);
      const em = new Graphics();
      em.position.set(r.x + r.w / 2, r.y + 54);
      drawEmblem(em, def.emblem, 72, def.accent, !owned);
      this.listC.addChild(em);
      const name = this.label(this.listC, def.name, r.x + r.w / 2, r.y + 100, 22, owned ? THEME.text : THEME.textDim, 0, 0.5);
      name.anchor.set(0.5, 0);
      const theme = this.label(this.listC, def.theme, r.x + r.w / 2, r.y + 130, 13, THEME.textDim, r.w - 16, 0.5);
      theme.anchor.set(0.5, 0);
      theme.style.align = 'center';
      const st = this.statusLine(def);
      const s = this.label(this.listC, st.text, r.x + r.w / 2, r.y + CARD_H - 44, 15, st.color, 0, 0.5);
      s.anchor.set(0.5, 0);
      const sub = this.label(this.listC, `Level ${fmtBig(hero.level)}  -  ${fmtBig(hero.kills)} kills`, r.x + r.w / 2, r.y + CARD_H - 24, 12, THEME.textDim, 0, 0.5);
      sub.anchor.set(0.5, 0);
      this.hits.push({ id: `card:${def.id}`, rect: r, enabled: true, label: def.name, act: () => this.show('detail', def.id), fixed: true });
    });
    this.contentH = 0;
  }

  // ---- detail view
  private drawDetail() {
    const def = CAPTAIN_BY_ID[this.selected] ?? CAPTAINS[0];
    const c = this.store.data.captains;
    const hero = c.heroes[def.id];
    const owned = isCaptainOwned(c, def.id);
    const medals = this.store.data.medals;

    // Fixed header: Back and the captain's name.
    this.button(this.fixedC, 'back', { x: PAD, y: TOP + 6, w: 100, h: 36 }, '< Back', true, () => this.show('list'), { fixed: true, size: 16 });
    const nm = this.label(this.fixedC, def.name, VIEW_W - PAD, TOP + 10, 24, def.accent, 0, 1);
    nm.anchor.set(1, 0);

    const L = this.listC;
    let y = PAD;
    // ---- identity
    const idR: Rect = { x: PAD, y, w: W, h: 132 };
    this.panel(L, idR, def.accent);
    const em = new Graphics();
    em.position.set(idR.x + 58, idR.y + 66);
    drawEmblem(em, def.emblem, 84, def.accent, !owned);
    L.addChild(em);
    this.label(L, def.name, idR.x + 116, idR.y + 10, 26, THEME.text);
    this.label(L, def.theme, idR.x + 116, idR.y + 44, 14, THEME.textDim, idR.w - 128);
    const st = this.statusLine(def);
    this.label(L, st.text, idR.x + 116, idR.y + 68, 14, st.color);
    const bx = idR.x + 116, bw = idR.w - 128;
    const isActive = c.selected === def.id;
    if (owned) {
      this.button(L, 'select', { x: bx, y: idR.y + 90, w: bw, h: 34 }, isActive ? 'Active captain' : 'Make active', !isActive, () => { if (!isActive) this.selectCaptain(def.id); });
    } else {
      this.button(L, 'unlock', { x: bx, y: idR.y + 90, w: bw, h: 34 }, `Unlock - ${def.unlockCost} Medals`, medals >= def.unlockCost, () => this.unlockCaptain(def.id), { accent: THEME.currency });
    }
    y += idR.h + 8;

    // ---- hero level
    const hR: Rect = { x: PAD, y, w: W, h: 104 };
    this.panel(L, hR);
    this.label(L, `Hero level ${fmtBig(hero.level)}`, hR.x + 12, hR.y + 10, 20, THEME.text);
    this.label(L, `+${fmtDamage(hero.level * HERO_LEVEL_BASE_DAMAGE)} base damage now`, hR.x + 12, hR.y + 40, 14, THEME.textDim);
    const cost = heroLevelCost(hero.level);
    this.label(L, `Each level: +${HERO_LEVEL_BASE_DAMAGE} base damage`, hR.x + 12, hR.y + 62, 13, THEME.textDim);
    const upLabel = `Upgrade +${HERO_LEVEL_BASE_DAMAGE} - ${fmtBig(cost)} Medal${cost === 1 ? '' : 's'}`;
    this.button(L, 'hero', { x: hR.x + hR.w - 232, y: hR.y + 28, w: 220, h: 44 }, upLabel, owned && medals >= cost, () => this.upgradeHero(def.id));
    y += hR.h + 8;

    // ---- kills and progress
    const kR: Rect = { x: PAD, y, w: W, h: 100 };
    this.panel(L, kR);
    this.label(L, `Lifetime kills: ${hero.kills}`, kR.x + 12, kR.y + 10, 20, THEME.text);
    const goal = nextTierGoal(hero);
    const prev = goal && goal.tier > 1 ? tierKillsNeeded(goal.tier - 1) : 0;
    const frac = goal ? Math.max(0, Math.min(1, (hero.kills - prev) / (goal.kills - prev))) : 1;
    const barX = kR.x + 12, barW = kR.w - 24;
    L.addChild(new Graphics().rect(barX, kR.y + 44, barW, 14).fill(THEME.hullDark).rect(barX, kR.y + 44, Math.round(barW * frac), 14).fill(def.accent));
    this.label(L, goal ? `Tier ${goal.tier} opens at ${goal.kills} kills (${goal.kills - hero.kills} to go)` : 'All four tiers are open', kR.x + 12, kR.y + 66, 14, THEME.textDim);
    y += kR.h + 8;

    // ---- the four tiers
    for (let t = 1; t <= TIER_COUNT; t++) {
      const open = isTierUnlocked(hero, t);
      this.label(L, `TIER ${t}`, PAD + 2, y + 4, 16, open ? THEME.text : THEME.textDim);
      this.label(L, open ? 'open' : `needs ${tierKillsNeeded(t)} kills (have ${hero.kills})`, VIEW_W - PAD - 2, y + 6, 13, open ? THEME.good : THEME.textDim, 0, 1).anchor.set(1, 0);
      y += 30;
      def.tiers[t - 1].forEach((opt, k) => {
        const r: Rect = { x: PAD + k * (CARD_W + 8), y, w: CARD_W, h: 164 };
        const state = optionState(hero, opt);
        const price = optionCost(opt);
        this.panel(L, r, state === 'active' ? def.accent : state === 'owned' ? THEME.buttonLine : THEME.border, state === 'active' ? 3 : 1.5);
        const dim = state === 'locked';
        this.label(L, opt.name, r.x + 10, r.y + 8, 17, dim ? THEME.textDim : THEME.text, r.w - 20);
        this.label(L, describeOption(opt), r.x + 10, r.y + 34, 13, dim ? THEME.disabled : THEME.textDim, r.w - 20);
        const tag = state === 'active' ? { t: 'ACTIVE', c: THEME.good } : state === 'owned' ? { t: 'OWNED', c: THEME.text } : state === 'locked' ? { t: 'LOCKED', c: THEME.disabled } : { t: 'AVAILABLE', c: THEME.currency };
        this.label(L, tag.t, r.x + 10, r.y + 96, 13, tag.c);
        this.label(L, `${price} Medals`, r.x + r.w - 10, r.y + 96, 13, state === 'owned' || state === 'active' ? THEME.disabled : THEME.currency, 0, 1).anchor.set(1, 0);
        const br: Rect = { x: r.x + 8, y: r.y + r.h - 40, w: r.w - 16, h: 32 };
        if (state === 'locked') this.button(L, `opt:${opt.id}`, br, `Needs ${tierKillsNeeded(t)} kills (have ${hero.kills})`, false, () => this.denied(`Needs ${tierKillsNeeded(t)} kills (have ${hero.kills})`), { size: 12 });
        else if (state === 'active') this.button(L, `opt:${opt.id}`, br, 'Active', false, () => {});
        else if (state === 'owned') this.button(L, `opt:${opt.id}`, br, 'Activate (free)', true, () => this.activate(opt.id));
        else if (!owned) this.button(L, `opt:${opt.id}`, br, 'Unlock the captain first', false, () => this.denied('Unlock this captain first'), { size: 12 });
        else this.button(L, `opt:${opt.id}`, br, `Buy - ${price} Medals`, medals >= price, () => this.buy(opt.id), { accent: THEME.currency });
        // A disabled button still answers a tap with the reason (toast + denied sound): the hit stays enabled for taps.
      });
      y += 164 + 8;
    }
    this.contentH = y + 8;
  }

  // ------------------------------------------------------------------ actions
  private denied(msg: string) {
    sfx.play('denied');
    this.toast.show(msg);
  }

  private ok(msg: string) {
    sfx.play('purchase');
    this.toast.show(msg, 1600);
  }

  private afterChange() {
    // The hero level and the selected captain change the base damage in the Build screen's stats strip.
    this.model.refreshCaptain();
  }

  private selectCaptain(id: string) {
    const r = this.store.selectCaptain(id);
    if (!r.ok) return this.denied(r.error);
    this.afterChange();
    this.ok(`${CAPTAIN_BY_ID[id].name} is now your captain`);
  }

  private unlockCaptain(id: string) {
    const r = this.store.unlockCaptain(id);
    if (!r.ok) return this.denied(r.error);
    this.ok(`Unlocked ${CAPTAIN_BY_ID[id].name} for ${r.cost} Medals`);
  }

  private upgradeHero(id: string) {
    const r = this.store.upgradeHero(id);
    if (!r.ok) return this.denied(r.error);
    this.afterChange();
    this.ok(`${CAPTAIN_BY_ID[id].name} is now level ${fmtBig(this.store.data.captains.heroes[id].level)}`);
  }

  private buy(optionId: string) {
    const r = this.store.buyOption(optionId);
    if (!r.ok) return this.denied(r.error);
    this.afterChange();
    const name = CAPTAINS.flatMap(c => c.tiers.flat()).find(o => o.id === optionId)?.name ?? optionId;
    this.ok(`Bought ${name} for ${r.cost} Medals`);
  }

  private activate(optionId: string) {
    const r = this.store.activateOption(optionId);
    if (!r.ok) return this.denied(r.error);
    this.afterChange();
    const name = CAPTAINS.flatMap(c => c.tiers.flat()).find(o => o.id === optionId)?.name ?? optionId;
    sfx.play('uiTap');
    this.toast.show(`${name} is active`, 1400);
  }
}
