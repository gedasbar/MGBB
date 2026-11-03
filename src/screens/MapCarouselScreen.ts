import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { Screen, ScreenManager } from './ScreenManager';
import { makeText, Toast, UIButton } from '../builder/ui';
import { makeTabButtons } from '../builder/tabs';
import { LAYOUT, VIEW_H, VIEW_W } from '../builder/layout';
import { CreditsBadge } from '../ui/hud';
import { drawButtonFace, drawTileFace } from '../ui/widgets';
import { UI } from '../ui/theme';
import { DEBUG_ON } from '../debug/enabled';
import { getProgressStore } from '../econ/progress';
import { CAROUSEL, MAP_MODES, MapMode } from '../map/constants';
import { cardAt, cardLook, dragPos, easePos, releaseVelocity, snapIndex, stepIndex } from '../map/carousel';
import { mapMemory } from '../map/memory';
import { modeStatus, modeTitle } from '../map/modes';
import { openModeScreen } from '../map/nav';
import { goToTab } from '../map/tabs';
import { drawPadlock, makeModeArt, ModeArt } from '../ui/modeArt';
import { DRAG_SLOP } from '../builder/gestures';
import { FRONTIER_NAME, MAP_UNLOCK_TIER } from '../frontier/constants';

const CARD_CY = 420;
const DOTS_Y = 690;
const ARROW = { w: 64, h: 52 };
const HEADER_H = 52;
const TAP_MAX_S = 0.6;

interface Card { mode: MapMode; container: Container; art: ModeArt; locked: boolean; line: string }

/**
 * Chunk 29b: the Map tab's front page. Three cards (CAMPAIGN, FRONTIER, FREE FLY) on a horizontal carousel: swipe, drag with the mouse, the arrow buttons or the
 * arrow keys move it, the centre card is the selected one (larger, full strength) and the neighbours peek in dimmed. Tapping the centre card opens that mode's screen.
 * The maths is in `src/map/carousel.ts`; which card is centred when the screen opens comes from the memory (`src/map/memory.ts`).
 */
export class MapCarouselScreen implements Screen {
  statsName = 'Map';
  container = new Container();
  private store = getProgressStore();
  private credits = new CreditsBadge();
  private toast = new Toast();
  private buttons: UIButton[] = [];
  private cards: Card[] = [];
  private cardLayer = new Container();
  private dots = new Graphics();
  private left!: UIButton;
  private right!: UIButton;
  /** The card the carousel settles on, and the (float) position it is easing to / being dragged to. */
  index: number;
  pos: number;
  private time = 0;
  private drag: { id: number; startX: number; startY: number; startPos: number; t0: number; moved: boolean; samples: { t: number; x: number }[] } | null = null;
  private unbind: (() => void) | null = null;

  constructor(private sm: ScreenManager, startMode?: MapMode) {
    this.index = Math.max(0, MAP_MODES.indexOf(startMode ?? mapMemory().centred()));
    this.pos = this.index;
    const p = this.store.data;
    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(UI.color.page);
    const bar = new Graphics().rect(0, 0, VIEW_W, HEADER_H).fill(UI.color.panel).rect(0, HEADER_H - 1, VIEW_W, 1).fill(UI.color.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(UI.color.panel).rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(UI.color.border);
    const medals = makeText(`Medals ${p.medals}`, UI.text.header + 5, UI.color.text, { fontWeight: 'bold' });
    medals.anchor.set(0, 0.5);
    medals.position.set(14, 27);
    this.credits.set(p.credits);

    for (const mode of MAP_MODES) this.cards.push(this.buildCard(mode));
    for (const c of this.cards) this.cardLayer.addChild(c.container);
    this.cardLayer.sortableChildren = true;

    this.left = this.arrowButton('carouselLeft', 70, '<', -1);
    this.right = this.arrowButton('carouselRight', VIEW_W - 70, '>', 1);
    this.buttons.push(this.left, this.right);
    const tabs = makeTabButtons('tabMap', (id) => this.tapTab(id));
    this.buttons.push(...tabs);

    this.container.addChild(bg, bar, medals, this.credits.container, this.cardLayer, this.dots, this.left.container, this.right.container);
    for (const t of tabs) this.container.addChild(t.container);
    this.container.addChild(this.toast.container);
    this.layout();
    this.installDevHook();
  }

  // ------------------------------------------------------------------ cards
  private buildCard(mode: MapMode): Card {
    const p = this.store.data;
    const st = modeStatus(mode, p);
    const c = new Container();
    const { w, h } = CAROUSEL.card;
    // The card face is drawn once; the centre card's white outline is a second layer shown only while it is the selected one.
    const face = drawTileFace(new Graphics(), { x: -w / 2, y: -h / 2, w, h });
    const sel = new Graphics().rect(-w / 2, -h / 2, w, h).stroke({ color: UI.color.selected, width: 3 });
    sel.label = 'sel';
    const title = makeText(modeTitle(mode), UI.text.title, st.locked ? UI.color.textDim : UI.color.text, { fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(0, -h / 2 + 34);
    const art = makeModeArt(mode);
    art.container.position.set(0, -24);
    const line = makeText(st.line, UI.text.header, st.locked ? UI.color.textDim : UI.color.accent, { fontWeight: 'bold', align: 'center', wordWrap: true, wordWrapWidth: w - 28, lineHeight: 22 });
    line.anchor.set(0.5, 0);
    line.position.set(0, h / 2 - 96);
    c.addChild(face, sel, title, art.container, line);
    if (st.locked) {
      art.container.alpha = 0.3;
      const lock = drawPadlock();
      lock.position.set(0, -30);
      lock.scale.set(1.8);
      c.addChild(lock);
      const unlock = makeText(`Unlocks when you pass tier ${MAP_UNLOCK_TIER}`, UI.text.body, UI.color.textDim, { align: 'center', wordWrap: true, wordWrapWidth: w - 40 });
      unlock.anchor.set(0.5, 0);
      unlock.position.set(0, h / 2 - 50);
      c.addChild(unlock);
    }
    return { mode, container: c, art, locked: st.locked, line: st.line };
  }

  private arrowButton(id: string, cx: number, label: string, dir: -1 | 1): UIButton {
    const b = new UIButton({
      id, rect: { x: cx - ARROW.w / 2, y: DOTS_Y - ARROW.h / 2, w: ARROW.w, h: ARROW.h }, onTap: () => this.step(dir),
      draw: (g, bb) => drawButtonFace(g, { x: 0, y: 0, w: ARROW.w, h: ARROW.h }, { enabled: bb.enabled, pressed: bb.lit }),
    });
    const t = makeText(label, UI.text.title, UI.color.text, { fontWeight: 'bold' });
    t.anchor.set(0.5);
    t.position.set(ARROW.w / 2, ARROW.h / 2);
    b.container.addChild(t);
    return b;
  }

  /** Places every card for the current position; the card nearest the centre is drawn on top and gets the outline. */
  private layout() {
    const centre = Math.round(this.pos);
    this.cards.forEach((c, i) => {
      const l = cardLook(i - this.pos);
      c.container.position.set(VIEW_W / 2 + l.dx, CARD_CY);
      c.container.scale.set(l.scale);
      c.container.alpha = l.alpha;
      c.container.zIndex = 100 - Math.abs(i - this.pos) * 10;
      const sel = c.container.getChildByLabel('sel');
      if (sel) sel.visible = i === centre;
    });
    this.left.setEnabled(this.index > 0);
    this.right.setEnabled(this.index < MAP_MODES.length - 1);
    this.dots.clear();
    MAP_MODES.forEach((_, i) => {
      const x = VIEW_W / 2 + (i - 1) * 24;
      this.dots.circle(x, DOTS_Y, i === this.index ? 6 : 4).fill(i === this.index ? UI.color.selected : UI.color.disabled);
    });
  }

  // ------------------------------------------------------------------ moving
  /** Moves to the card `dir` steps away (arrow buttons, keys). */
  step(dir: -1 | 1) { this.goTo(stepIndex(this.index, dir, MAP_MODES.length)); }

  goTo(i: number) {
    this.index = Math.max(0, Math.min(MAP_MODES.length - 1, i));
    this.layout();
  }

  get centredMode(): MapMode { return MAP_MODES[this.index]; }

  /** Opens the centre card's mode (a locked one only explains). */
  openCentre() {
    const card = this.cards[this.index];
    if (card.locked) {
      this.toast.show(`${FRONTIER_NAME} opens after you pass tier ${MAP_UNLOCK_TIER}`);
      return;
    }
    openModeScreen(this.sm, card.mode);
  }

  // ------------------------------------------------------------------ input
  init() {
    const canvas = this.sm.app.canvas as HTMLCanvasElement;
    const toGame = (e: { clientX: number; clientY: number }) => clientToGame(e.clientX, e.clientY, canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H);
    const now = () => performance.now() / 1000;
    const down = (e: PointerEvent) => {
      if (this.drag) return;
      const g = toGame(e);
      this.drag = { id: e.pointerId, startX: g.x, startY: g.y, startPos: this.pos, t0: now(), moved: false, samples: [{ t: now(), x: g.x }] };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    };
    const move = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const g = toGame(e);
      if (!d.moved && Math.hypot(g.x - d.startX, g.y - d.startY) > DRAG_SLOP) {
        // Only a press that started on a card (not a button) turns into a swipe.
        d.moved = this.buttons.some(b => b.hit(d.startX, d.startY)) ? false : true;
        if (!d.moved) { this.drag = null; return; }
      }
      if (!d.moved) return;
      d.samples.push({ t: now(), x: g.x });
      if (d.samples.length > 12) d.samples.shift();
      this.pos = dragPos(d.startPos, g.x - d.startX, MAP_MODES.length);
      this.layout();
    };
    const up = (e: PointerEvent) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      const g = toGame(e);
      if (d.moved) {
        this.index = snapIndex(this.pos, releaseVelocity(d.samples), MAP_MODES.length);
        this.layout();
      } else if (now() - d.t0 < TAP_MAX_S) {
        this.tap(g.x, g.y);
      }
    };
    const cancel = (e: PointerEvent) => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      this.index = Math.round(Math.max(0, Math.min(MAP_MODES.length - 1, this.pos)));
      this.layout();
    };
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.code === 'ArrowLeft') this.step(-1);
      else if (e.code === 'ArrowRight') this.step(1);
      else if (e.code === 'Enter') this.openCentre();
      else return;
      e.preventDefault();
    };
    const wheel = (e: WheelEvent) => {
      const g = toGame(e);
      if (g.y < HEADER_H || g.y >= LAYOUT.tabs.y) return;
      const dir = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(dir) > 4) this.step(dir > 0 ? 1 : -1);
      e.preventDefault();
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    this.unbind = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
    };
  }

  /** A tap (game coordinates): a button, else a card (the centre one opens its mode, a neighbour comes to the centre). */
  tap(x: number, y: number) {
    const b = this.buttons.find(bb => bb.hit(x, y));
    if (b) { if (b.enabled) { b.flash(); b.spec.onTap(); } return; }
    if (y < HEADER_H || y >= LAYOUT.tabs.y) return;
    if (Math.abs(y - CARD_CY) > CAROUSEL.card.h / 2) return;
    const i = cardAt(x, this.pos, MAP_MODES.length, VIEW_W / 2, CAROUSEL.card.w);
    if (i < 0) return;
    if (i === this.index) this.openCentre(); else this.goTo(i);
  }

  private tapTab(id: string) {
    if (id !== 'tabMap') goToTab(this.sm, id);
  }

  update(dt: number) {
    this.time += dt;
    for (const c of this.cards) c.art.tick(this.time);
    if (!this.drag?.moved && this.pos !== this.index) {
      this.pos = easePos(this.pos, this.index, dt);
      this.layout();
    }
    this.toast.update(dt * 1000);
  }

  destroy() {
    this.unbind?.();
    this.container.destroy({ children: true });
  }

  private installDevHook() {
    if (!DEBUG_ON) return;
    (window as any).__mgbm = {
      screen: 'carousel',
      carousel: this,
      state: () => ({
        index: this.index, mode: this.centredMode, pos: this.pos,
        cards: this.cards.map((c, i) => ({ mode: c.mode, line: c.line, locked: c.locked, scale: c.container.scale.x, alpha: c.container.alpha, x: c.container.x, centre: i === this.index })),
        toast: this.toast.message,
        left: this.left.enabled, right: this.right.enabled,
      }),
      centreRect: () => ({ x: VIEW_W / 2 - CAROUSEL.card.w / 2, y: CARD_CY - CAROUSEL.card.h / 2, w: CAROUSEL.card.w, h: CAROUSEL.card.h }),
      buttonRect: (id: string) => this.buttons.find(b => b.id === id)?.rect,
      step: (d: -1 | 1) => this.step(d),
      openCentre: () => this.openCentre(),
    };
  }
}
