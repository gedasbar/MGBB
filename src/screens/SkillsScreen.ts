import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { BuildScreen } from './BuildScreen';
import { ShopScreen } from './ShopScreen';
import { CaptainScreen } from './CaptainScreen';
import { MapScreen } from './MapScreen';
import { GestureTracker } from '../builder/gestures';
import { inRect, LAYOUT, Rect, VIEW_W } from '../builder/layout';
import { makeTabButtons } from '../builder/tabs';
import { makeText, Toast, UIButton } from '../builder/ui';
import { getBuilderModel } from '../builder/session';
import { getProgressStore } from '../econ/progress';
import { textButton, TextButton } from '../ui/hud';
import { drawPlate } from '../ui/blockArt';
import { fmtBig } from '../ui/format';
import { THEME } from '../ui/theme';
import { BLOCKS } from '../data/blocks';
import { PATHS, SKILL_BY_ID, SKILL_NODES, SkillNode } from '../data/skillTree';
import { PROGRESS_COLOR, WHEEL_ZOOM_RATE } from '../frontier/constants';
import { buyBlocker, freePoints, pointRingBounds, respecCost, skillPointsFor } from '../skills/rules';
import { SKILL_START_ID } from '../skills/constants';
import { CAPSTONE_SCALE, HEX_RADIUS, hexCentre, hexCorners, nodeAt, nodeRadius, SKILL_ZOOM_MAX, SKILL_ZOOM_MIN, treeBounds } from '../skills/layout';
import type { StatsInfo } from '../ui/stats';

const TOP = 52;
const BAR_Y = 636;
const PANEL_Y = 690;
const TABS_Y = LAYOUT.tabs.y;
/** The map's screen rectangle (between the top bar and the progress bar). */
const MAP: Rect = { x: 0, y: TOP, w: VIEW_W, h: BAR_Y - TOP };
const MCX = MAP.x + MAP.w / 2;
const MCY = MAP.y + MAP.h / 2;
/** Size (map units) of a block plate drawn inside a hexagon. */
const PLATE_CELL = 46;
const DOT = 0xf2c230;

type NodeState = 'owned' | 'buyable' | 'locked';

/** Where the map is looking, kept while the app runs (a new Skills screen opens where the last one was). */
const session = { cx: 0, cy: 0, zoom: 0, sel: null as string | null };

/**
 * The Skills tab (chunk 22a): a pan / zoom map of hexagonal nodes. Owned nodes are filled lavender, nodes that touch an owned
 * one are outlined (with a yellow dot while a point is free), the rest are dim. A tap selects a node; the panel below buys it.
 */
export class SkillsScreen implements Screen {
  statsName = 'Skills';
  container = new Container();
  private store = getProgressStore();
  private toast = new Toast();
  private hexG = new Graphics();
  private mapC = new Container();
  private icons = new Map<string, Container>();
  private buttons: UIButton[] = [];
  private gestures: GestureTracker | null = null;
  private dirty = true;
  private unsub: (() => void) | null = null;
  private buyButton: TextButton;
  private respecButton: TextButton;
  private dialog = new Container();
  dialogOpen = false;

  private title = makeText('Skills', 22, THEME.text, { fontWeight: 'bold' });
  private points = makeText('', 18, THEME.text, { fontWeight: 'bold' });
  private barText = makeText('', 14, THEME.textDim, { fontWeight: 'bold' });
  private barG = new Graphics();
  private nameText = makeText('', 20, THEME.text, { fontWeight: 'bold' });
  private pathText = makeText('', 14, THEME.textDim, { fontWeight: 'bold' });
  private effectText = makeText('', 17, THEME.text, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: VIEW_W - 28 });
  private stateText = makeText('', 15, THEME.textDim, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: VIEW_W - 28 });

  constructor(private sm: ScreenManager) {
    const bg = new Graphics().rect(0, 0, VIEW_W, CONFIG.VIEW.H).fill(THEME.bg);
    const chrome = new Graphics()
      .rect(0, 0, VIEW_W, TOP).fill(THEME.panel).rect(0, TOP - 1, VIEW_W, 1).fill(THEME.border)
      .rect(0, BAR_Y, VIEW_W, TABS_Y - BAR_Y).fill(THEME.panel).rect(0, BAR_Y, VIEW_W, 1).fill(THEME.border)
      .rect(0, PANEL_Y, VIEW_W, 1).fill(THEME.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(THEME.panel)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(THEME.border);

    this.title.anchor.set(0, 0.5);
    this.title.position.set(14, 27);
    this.points.anchor.set(0.5, 0.5);
    this.points.position.set(VIEW_W / 2 - 10, 27);
    this.respecButton = textButton('skillsRespec', { x: VIEW_W - 14 - 120, y: 6, w: 120, h: 40 }, 'Respec', () => this.openRespec(), 16);

    this.barText.position.set(14, BAR_Y + 8);
    this.barG.position.set(14, BAR_Y + 32);
    this.nameText.position.set(14, PANEL_Y + 10);
    this.pathText.anchor.set(1, 0);
    this.pathText.position.set(VIEW_W - 14, PANEL_Y + 14);
    this.effectText.position.set(14, PANEL_Y + 42);
    this.stateText.position.set(14, PANEL_Y + 92);
    this.buyButton = textButton('skillsBuy', { x: VIEW_W - 14 - 170, y: TABS_Y - 12 - 56, w: 170, h: 56 }, 'Buy', () => this.buy(), 22);

    // Icons are made once (the plates never change); their place and size follow the camera.
    for (const n of SKILL_NODES) {
      const ic = new Container();
      const g = new Graphics();
      this.drawIcon(g, n);
      ic.addChild(g);
      this.icons.set(n.id, ic);
      this.mapC.addChild(ic);
    }
    const clip = new Graphics().rect(MAP.x, MAP.y, MAP.w, MAP.h).fill(0xffffff);
    this.mapC.mask = clip;

    const tabs = makeTabButtons('tabSkills', (id) => this.tapTab(id));
    this.buttons.push(this.respecButton, this.buyButton, ...tabs);
    this.container.addChild(bg, this.hexG, this.mapC, clip, chrome, this.title, this.points, this.barText, this.barG, this.nameText, this.pathText, this.effectText, this.stateText);
    for (const b of this.buttons) this.container.addChild(b.container);
    this.dialog.visible = false;
    this.container.addChild(this.dialog);
    this.toast.container.y = -150;
    this.container.addChild(this.toast.container);

    if (session.zoom === 0) this.fit();
    this.unsub = this.store.onChange(() => { this.dirty = true; });
    this.installDevHook();
  }

  // ------------------------------------------------------------------ state
  private get owned(): readonly string[] { return this.store.data.skills; }
  private get ring(): number { return this.store.skillRing; }

  stateOf(id: string): NodeState {
    if (id === SKILL_START_ID || this.owned.includes(id)) return 'owned';
    return SKILL_BY_ID[id].links.some(l => l === SKILL_START_ID || this.owned.includes(l)) ? 'buyable' : 'locked';
  }

  // ------------------------------------------------------------------ camera
  /** Fits the whole tree in the map (the first view and the Recenter reset). */
  fit() {
    const b = treeBounds();
    session.cx = (b.x0 + b.x1) / 2;
    session.cy = (b.y0 + b.y1) / 2;
    session.zoom = Math.max(SKILL_ZOOM_MIN, Math.min(MAP.w / (b.x1 - b.x0), MAP.h / (b.y1 - b.y0)));
    this.dirty = true;
  }

  /** Screen position of a map point. */
  toScreen(mx: number, my: number): { x: number; y: number } {
    return { x: MCX + (mx - session.cx) * session.zoom, y: MCY + (my - session.cy) * session.zoom };
  }

  nodeScreen(id: string): { x: number; y: number } {
    const c = hexCentre(SKILL_BY_ID[id].at);
    return this.toScreen(c.x, c.y);
  }

  pan(dx: number, dy: number) {
    session.cx -= dx / session.zoom;
    session.cy -= dy / session.zoom;
    this.dirty = true;
  }

  zoomAt(factor: number, px: number, py: number) {
    const wx = session.cx + (px - MCX) / session.zoom;
    const wy = session.cy + (py - MCY) / session.zoom;
    session.zoom = Math.max(SKILL_ZOOM_MIN, Math.min(SKILL_ZOOM_MAX, session.zoom * factor));
    session.cx = wx - (px - MCX) / session.zoom;
    session.cy = wy - (py - MCY) / session.zoom;
    this.dirty = true;
  }

  /** Dev and tests: looks at a node at the given zoom. */
  focus(id: string, zoom?: number) {
    const c = hexCentre(SKILL_BY_ID[id].at);
    session.cx = c.x; session.cy = c.y;
    if (zoom !== undefined) session.zoom = zoom;
    this.dirty = true;
  }

  // ------------------------------------------------------------------ drawing
  private drawIcon(g: Graphics, n: SkillNode) {
    if (BLOCKS[n.glyph]) { drawPlate(g, n.glyph, PLATE_CELL); return; }
    const c = THEME.text;
    switch (n.glyph) {
      case 'coin': g.rect(-11, -11, 22, 22).fill(THEME.currency).rect(-5, -5, 10, 10).stroke({ color: THEME.panel, width: 3 }); break;
      case 'medal': g.circle(0, 0, 12).fill(THEME.currency).circle(0, 0, 5).stroke({ color: THEME.panel, width: 3 }); break;
      case 'refresh': g.arc(0, 0, 11, 0.5, 5.4).stroke({ color: c, width: 4 }).poly([4, -17, 14, -9, 3, -5]).fill(c); break;
      case 'hero': g.poly([0, -13, 13, 11, 0, 4, -13, 11]).fill(c); break;
      default: g.poly([0, -14, 4, -4, 14, 0, 4, 4, 0, 14, -4, 4, -14, 0, -4, -4]).fill(c); // 'star'
    }
  }

  private redraw() {
    const z = session.zoom;
    const g = this.hexG.clear();
    const free = freePoints(this.ring, this.owned) > 0;
    // Links first (under the hexagons): lavender between two owned nodes, dim otherwise.
    for (const n of SKILL_NODES) {
      const a = this.nodeScreen(n.id);
      for (const l of n.links) {
        if (l < n.id) continue;
        const b = this.nodeScreen(l);
        const both = this.stateOf(n.id) === 'owned' && this.stateOf(l) === 'owned';
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color: both ? PROGRESS_COLOR : THEME.border, width: Math.max(1.5, 3 * z) });
      }
    }
    for (const n of SKILL_NODES) {
      const c = this.nodeScreen(n.id);
      const r = nodeRadius(n) * z;
      const st = this.stateOf(n.id);
      const sel = session.sel === n.id;
      const poly = hexCorners(c.x, c.y, r);
      if (st === 'owned') g.poly(poly).fill(PROGRESS_COLOR).stroke({ color: THEME.text, width: sel ? 3 : 1.5 });
      else if (st === 'buyable') g.poly(poly).fill(THEME.panel).stroke({ color: THEME.buttonLine, width: sel ? 3.5 : 2 });
      else g.poly(poly).fill(THEME.voidFill).stroke({ color: sel ? THEME.text : THEME.border, width: sel ? 3 : 1.5 });
      if (st === 'buyable' && free) g.rect(c.x + r * 0.45, c.y + r * 0.45, Math.max(5, r * 0.28), Math.max(5, r * 0.28)).fill(DOT);
      const ic = this.icons.get(n.id)!;
      ic.position.set(c.x, c.y);
      ic.scale.set((z * (n.capstone ? CAPSTONE_SCALE : 1)) * (HEX_RADIUS / 30));
      ic.alpha = st === 'locked' ? 0.3 : 1;
      ic.visible = c.x > MAP.x - r && c.x < MAP.x + MAP.w + r && c.y > MAP.y - r && c.y < MAP.y + MAP.h + r;
    }
  }

  private updateChrome() {
    const p = this.store.data;
    const total = skillPointsFor(this.ring);
    const free = freePoints(this.ring, p.skills);
    this.points.text = `Points ${free} / ${total}`;
    this.points.style.fill = free > 0 ? THEME.currency : THEME.text;
    this.respecButton.setEnabled(p.skills.length > 0);
    const { prev, next } = pointRingBounds(this.ring);
    this.barText.text = `Furthest ring ${fmtBig(this.ring)}  ·  next point at ring ${fmtBig(next)}`;
    const w = VIEW_W - 28;
    const f = Math.max(0, Math.min(1, (this.ring - prev) / (next - prev)));
    this.barG.clear().rect(0, 0, w, 10).fill(THEME.cellFill).rect(0, 0, w * f, 10).fill(PROGRESS_COLOR);
    this.updatePanel();
  }

  private updatePanel() {
    const id = session.sel;
    const n = id ? SKILL_BY_ID[id] : null;
    if (!n) {
      this.nameText.text = 'Select a skill';
      this.pathText.text = '';
      this.effectText.text = '';
      this.stateText.text = '';
      this.buyButton.setText('Buy');
      this.buyButton.setEnabled(false);
      return;
    }
    const st = this.stateOf(n.id);
    this.nameText.text = n.name;
    this.pathText.text = n.path === 'start' ? '' : PATHS.find(pp => pp.id === n.path)!.name + (n.capstone ? ' · capstone' : '');
    this.effectText.text = n.text;
    const lines: string[] = [];
    const block = n.needsBlock;
    if (block && !((this.store.data.owned[block] ?? 0) > 0)) lines.push(`Needs the ${BLOCKS[block]?.name ?? block} block (you can buy this first)`);
    if (st === 'owned') lines.push(n.id === SKILL_START_ID ? 'The free centre of the tree' : 'Owned');
    else if (st === 'locked') lines.push('Locked: buy a skill next to it first');
    else lines.push(buyBlocker(this.ring, this.owned, n.id) ?? 'Costs 1 skill point');
    this.stateText.text = lines.join('\n');
    this.buyButton.setText(st === 'owned' ? 'Owned' : 'Buy');
    this.buyButton.setEnabled(st === 'buyable');
  }

  // ------------------------------------------------------------------ actions
  select(id: string | null) {
    session.sel = id;
    this.dirty = true;
  }

  buy(): boolean {
    const id = session.sel;
    if (!id) return false;
    const r = this.store.buySkill(id);
    if (!r.ok) { this.toast.show(r.error); return false; }
    this.dirty = true;
    getBuilderModel().refreshCaptain(); // the builder's estimate includes the skills
    return true;
  }

  openRespec() {
    if (this.owned.length === 0) { this.toast.show('You have no skills to take back'); return; }
    for (const ch of this.dialog.removeChildren()) ch.destroy({ children: true });
    const cost = respecCost(this.owned);
    const have = this.store.data.medals;
    const can = have >= cost;
    const w = VIEW_W - 60, h = 250, x = 30, y = 300;
    const shade = new Graphics().rect(0, 0, VIEW_W, CONFIG.VIEW.H).fill({ color: 0x000000, alpha: 0.6 }).rect(x, y, w, h).fill(THEME.panel).stroke({ color: THEME.buttonLine, width: 2 });
    const t = makeText('Respec', 24, THEME.text, { fontWeight: 'bold' });
    t.position.set(x + 20, y + 16);
    const body = makeText(`Take back all ${this.owned.length} skills and get every point back.\nCost: ${cost} Medals (you have ${fmtBig(have)}).${can ? '' : '\nNot enough Medals.'}`, 17, can ? THEME.textDim : THEME.bad, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: w - 40 });
    body.position.set(x + 20, y + 56);
    this.dialog.addChild(shade, t, body);
    const yes = textButton('skillsRespecYes', { x: x + 20, y: y + h - 70, w: (w - 60) / 2, h: 52 }, 'Respec', () => this.confirmRespec(), 20);
    const no = textButton('skillsRespecNo', { x: x + 40 + (w - 60) / 2, y: y + h - 70, w: (w - 60) / 2, h: 52 }, 'Cancel', () => this.closeRespec(), 20);
    yes.setEnabled(can);
    this.dialogButtons = [yes, no];
    this.dialog.addChild(yes.container, no.container);
    this.dialog.visible = true;
    this.dialogOpen = true;
  }

  private dialogButtons: UIButton[] = [];

  closeRespec() {
    this.dialog.visible = false;
    this.dialogOpen = false;
  }

  confirmRespec(): boolean {
    const r = this.store.respecSkills();
    this.closeRespec();
    if (!r.ok) { this.toast.show(r.error); return false; }
    this.toast.show(`Skills taken back for ${r.cost} Medals`);
    this.dirty = true;
    getBuilderModel().refreshCaptain();
    return true;
  }

  // ------------------------------------------------------------------ input
  init() {
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => { if (!this.sm.overlays?.blocking) this.tap(x, y); },
        onDrag: (dx, dy) => this.pan(dx, dy),
        onPinch: (f, cx, cy) => this.zoomAt(f, cx, cy),
        onWheel: (dy, x, y) => { if (inRect(MAP, x, y) && !this.dialogOpen) this.zoomAt(Math.exp(-dy * WHEEL_ZOOM_RATE), x, y); },
        canDrag: (x, y) => !this.sm.overlays?.blocking && !this.dialogOpen && inRect(MAP, x, y),
      },
    );
    this.gestures.attach();
    this.updateChrome();
  }

  tap(x: number, y: number) {
    if (this.dialogOpen) {
      const b = this.dialogButtons.find(bb => bb.hit(x - this.dialog.x, y - this.dialog.y));
      if (b && b.enabled) { b.flash(); b.spec.onTap(); }
      return;
    }
    const b = this.buttons.find(bb => bb.hit(x, y));
    if (b) {
      if (b.enabled) { b.flash(); b.spec.onTap(); }
      else if (b === this.buyButton && session.sel && this.stateOf(session.sel) === 'locked') this.toast.show('Buy a skill next to it first');
      return;
    }
    if (!inRect(MAP, x, y)) return;
    const mx = session.cx + (x - MCX) / session.zoom;
    const my = session.cy + (y - MCY) / session.zoom;
    this.select(nodeAt(mx, my)?.id ?? null);
  }

  private tapTab(id: string) {
    if (id === 'tabSkills') return;
    if (id === 'tabBuild') this.sm.switchTo(new BuildScreen(this.sm));
    else if (id === 'tabShop') this.sm.switchTo(new ShopScreen(this.sm));
    else if (id === 'tabCaptain') this.sm.switchTo(new CaptainScreen(this.sm));
    else if (id === 'tabMap') this.sm.switchTo(new MapScreen(this.sm));
  }

  update(dt: number) {
    this.toast.update(dt * 1000);
    const notices = this.store.takeUnlockNotices();
    if (notices.length) this.toast.show(notices.join('\n'), 3500);
    if (this.dirty) {
      this.dirty = false;
      this.redraw();
      this.updateChrome();
    }
  }

  statsInfo(o: StatsInfo) {
    o.name = 'SKILLS';
    o.proj = 0; o.projCap = 0; o.enemies = 0; o.fx = 0; o.kills = 0;
    o.extra = `zoom ${session.zoom.toFixed(2)}`;
  }

  destroy() {
    this.gestures?.detach();
    this.unsub?.();
    this.container.destroy({ children: true });
  }

  private installDevHook() {
    if (!import.meta.env.DEV) return;
    const store = this.store;
    (window as any).__mgbm = {
      screen: 'skills',
      state: () => ({
        camera: { cx: session.cx, cy: session.cy, zoom: session.zoom },
        selected: session.sel,
        owned: [...store.data.skills],
        points: this.points.text,
        bar: this.barText.text,
        panel: { name: this.nameText.text, path: this.pathText.text, effect: this.effectText.text, state: this.stateText.text, buy: this.buyButton.enabled, buyLabel: this.buyButton.spec.id },
        dialogOpen: this.dialogOpen,
        respecEnabled: this.respecButton.enabled,
        medals: store.data.medals, ring: store.skillRing, toast: this.toast.message,
        states: Object.fromEntries(SKILL_NODES.map(n => [n.id, this.stateOf(n.id)])),
      }),
      nodeScreen: (id: string) => this.nodeScreen(id),
      select: (id: string | null) => this.select(id),
      buy: () => this.buy(),
      focus: (id: string, zoom?: number) => this.focus(id, zoom),
      fit: () => this.fit(),
      pan: (dx: number, dy: number) => this.pan(dx, dy),
      zoomAt: (f: number, x: number, y: number) => this.zoomAt(f, x, y),
      openRespec: () => this.openRespec(),
      confirmRespec: () => this.confirmRespec(),
      closeRespec: () => this.closeRespec(),
      /** Dev: passes a square at this ring (east) so the furthest ring is `r`. */
      setRing: (r: number) => { store.data.frontier.sq[`${r},0`] = 2; store.commit(); },
      progress: store,
    };
  }
}
