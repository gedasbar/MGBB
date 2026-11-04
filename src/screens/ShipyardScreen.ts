import { Container, Graphics } from 'pixi.js';
import { Screen, ScreenManager } from './ScreenManager';
import { FlyScreen } from './FlyScreen';
import { makeText, Toast } from '../builder/ui';
import { VIEW_H, VIEW_W, inRect, Rect } from '../builder/layout';
import { REMOVE_TILE } from '../builder/paletteLogic';
import { PaletteSource, TilePalette } from '../builder/tilePalette';
import { GestureTracker } from '../builder/gestures';
import { getBuilderModel } from '../builder/session';
import { textButton, TextButton } from '../ui/hud';
import { drawTileFace } from '../ui/widgets';
import { UI } from '../ui/theme';
import { fmtBig } from '../ui/format';
import { DEBUG_ON } from '../debug/enabled';
import { sfx } from '../audio';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { getProgressStore } from '../econ/progress';
import { compile } from '../engine/compiler';
import { CHUNKS, CHUNK_BY_ID } from '../data/shipChunks';
import { customHullInfo, setCustomHull } from '../data/hulls';
import { withHull } from '../game/gridUtils';
import { CellEditor } from '../shipyard/cellMode';
import { drawCell, drawChunkFace, drawPattern } from '../shipyard/chunkArt';
import { CELL_TEST_HULL, CURRENCY_CORES_NAME, DESIGN_SLOTS, MAX_DESIGNS, SHIPYARD_UNLOCK_RING } from '../shipyard/constants';
import { basePulses, sizeOfChunks } from '../shipyard/design';
import { openNameDialog, openTextDialog } from '../shipyard/dialogs';
import { ShipyardEditor } from '../shipyard/editor';
import {
  cellAtPoint, cellMetrics, chunkSheet, designTabRects, nameBoxRect, problemSlots, removeChunkSheet, slotAtPoint, slotRect, statsText, statusText,
  SY_HEADER_H, SY_PALETTE, SY_STATUS, SY_TOOLBAR,
} from '../shipyard/viewLogic';
import { goToTab } from '../map/tabs';
import { NO_EJECTOR_TEXT } from '../map/nav';

const PAD = 10;
const GAP = 6;
const EMPTY_SLOT_FILL = 0x232326;
const PROBLEM_LINE = 0xd96a5a;

/**
 * The Shipyard (chunk 31b): design a custom hull from ship chunks, like the circuit builder. A 4 x 4 grid of chunk slots; tap a slot to open the chunk palette (the
 * block palette's tile component), place / remove / replace, undo / redo, three saved designs, a live stats strip, and "Use this ship". With ?debug=1 a Cell mode
 * draws a hull layout cell by cell (validated, exported as ROWS text, flown without saving). The rules are in shipyard/ (pure), this file is the Pixi side.
 */
export class ShipyardScreen implements Screen {
  statsName = 'Shipyard';
  container = new Container();
  private store = getProgressStore();
  readonly ed = new ShipyardEditor(this.store);
  readonly cell = new CellEditor();
  readonly palette: TilePalette;
  private toast = new Toast();
  private gestures: GestureTracker | null = null;
  /** The grid slot the palette is open for, or -1. */
  selectedSlot = -1;
  cellMode = false;
  private gridG = new Graphics();
  private chromeG = new Graphics();
  private titleT = makeText('SHIPYARD', UI.text.title, UI.color.text, { fontWeight: 'bold' });
  private coresT = makeText('', UI.text.header, UI.color.accent, { fontWeight: 'bold' });
  private nameT = makeText('', UI.text.header, UI.color.text, { fontWeight: 'bold' });
  private statusT = makeText('', UI.text.header, UI.color.text, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: SY_STATUS.w });
  private statsT = makeText('', UI.text.body, UI.color.textDim);
  private hintT = makeText('', UI.text.body, UI.color.textDim, { wordWrap: true, wordWrapWidth: VIEW_W - 2 * PAD });
  private designTabs: TextButton[] = [];
  private undoB: TextButton;
  private redoB: TextButton;
  private useB: TextButton;
  private cellModeB: TextButton | null = null;
  private cellButtons: TextButton[] = [];
  private all: TextButton[] = [];
  /** The hull the builder was on and the layout it had when the screen opened, to tell on leaving whether the builder must read its hull again. */
  private builderHull: string;
  private builderKey: string;

  constructor(private sm: ScreenManager) {
    const model = getBuilderModel();
    this.builderHull = model.hullId;
    this.builderKey = this.layoutKey(this.builderHull);
    this.container.addChild(new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(UI.color.page));
    this.chromeG.rect(0, 0, VIEW_W, SY_HEADER_H).fill(UI.color.panel).rect(0, SY_HEADER_H - 1, VIEW_W, 1).fill(UI.color.border);
    this.titleT.anchor.set(0, 0.5); this.titleT.position.set(64, 27);
    this.coresT.anchor.set(1, 0.5); this.coresT.position.set(VIEW_W - 14, 27);
    this.nameT.anchor.set(0, 0.5);
    this.statusT.position.set(SY_STATUS.x, SY_STATUS.y);
    this.statsT.position.set(SY_STATUS.x, SY_STATUS.y + 26);
    this.hintT.position.set(PAD, SY_TOOLBAR.y + 64);
    this.container.addChild(this.chromeG, this.titleT, this.coresT, this.gridG, this.nameT, this.statusT, this.statsT, this.hintT);

    this.add(textButton('shipyardBack', { x: 6, y: 6, w: 46, h: 40 }, '<', () => this.leave(), 24));
    for (let i = 0; i < MAX_DESIGNS; i++) {
      const r = designTabRects(MAX_DESIGNS)[i];
      this.designTabs.push(this.add(textButton(`design${i + 1}`, { x: r.x, y: r.y, w: r.w - 4, h: r.h }, String(i + 1), () => this.switchDesign(i), 22)));
    }
    // Design-mode toolbar: Undo, Redo, the big Use button, and (debug) the Cell mode switch.
    const tb = SY_TOOLBAR;
    const cm = DEBUG_ON;
    const useW = cm ? 200 : 300;
    this.undoB = this.add(textButton('undo', { x: PAD, y: tb.y, w: 80, h: tb.h }, 'Undo', () => this.undo(), 16));
    this.redoB = this.add(textButton('redo', { x: PAD + 80 + GAP, y: tb.y, w: 80, h: tb.h }, 'Redo', () => this.redo(), 16));
    this.useB = this.add(textButton('use', { x: PAD + 2 * (80 + GAP), y: tb.y, w: useW, h: tb.h }, 'Use this ship', () => this.use(), 17));
    if (cm) this.cellModeB = this.add(textButton('cellMode', { x: PAD + 2 * (80 + GAP) + useW + GAP, y: tb.y, w: 90, h: tb.h }, 'Cell mode', () => this.setCellMode(true), 14));
    // Cell-mode toolbar (debug only): size, export, fly test, and back to chunks.
    if (cm) {
      const specs: [string, string, number, () => void][] = [
        ['cellWminus', 'W-', 50, () => this.resizeCells(-1, 0)], ['cellWplus', 'W+', 50, () => this.resizeCells(1, 0)],
        ['cellHminus', 'H-', 50, () => this.resizeCells(0, -1)], ['cellHplus', 'H+', 50, () => this.resizeCells(0, 1)],
        ['cellExport', 'Export', 84, () => this.exportCells()], ['cellFly', 'Fly test', 84, () => this.flyTest()],
        ['cellExit', 'Chunks', 90, () => this.setCellMode(false)],
      ];
      let x = PAD;
      for (const [id, label, w, fn] of specs) {
        const b = this.add(textButton(id, { x, y: tb.y, w, h: tb.h }, label, fn, 14));
        this.cellButtons.push(b);
        x += w + GAP;
      }
    }
    this.palette = new TilePalette({ area: SY_PALETTE, buttons: ['place', 'buy'], tapAgain: 'place', panel: true, drawFace: drawChunkFace });
    this.palette.hide();
    for (const b of this.all) this.container.addChild(b.container);
    // The palette is above the buttons it covers.
    this.container.addChild(this.palette.container);
    this.container.addChild(this.toast.container);
    this.refresh();
    this.installDevHook();
  }

  private add(b: TextButton): TextButton { this.all.push(b); return b; }

  // ------------------------------------------------------------------ actions
  private switchDesign(i: number) {
    if (this.cellMode) return;
    this.ed.switchSlot(i);
    this.closePalette();
    this.refresh();
  }

  undo() { const r = this.ed.undo(); if (r.ok) sfx.play('uiTap'); this.closePalette(); this.refresh(); }
  redo() { const r = this.ed.redo(); if (r.ok) sfx.play('uiTap'); this.closePalette(); this.refresh(); }

  /** "Use this ship": the design becomes the builder's hull (only when valid and fully owned), and the builder opens on it. */
  use() {
    if (!this.ed.canUse()) {
      sfx.play('denied');
      this.toast.show(this.ed.problems()[0] ?? 'The Shipyard is not open yet', 3000);
      return;
    }
    this.syncBuilder();
    const res = getBuilderModel().switchHull(this.ed.hullId());
    if (!res.ok) { sfx.play('denied'); this.toast.show(res.error ?? 'Cannot use this ship'); return; }
    goToTab(this.sm, 'tabBuild');
  }

  /** Back to the builder. If its hull is a custom one whose design changed (or stopped being flyable), the builder reads it again. */
  leave() {
    this.syncBuilder();
    goToTab(this.sm, 'tabBuild');
  }

  private layoutKey(hullId: string): string {
    return customHullInfo(hullId)?.rows.join('/') ?? (this.store.data.ownedHulls.includes(hullId) ? 'ok' : 'gone');
  }

  private syncBuilder() {
    const model = getBuilderModel();
    if (model.hullId === this.builderHull && this.layoutKey(this.builderHull) === this.builderKey) return;
    if (this.builderHull === model.hullId) model.reloadHull();
  }

  setCellMode(on: boolean) {
    if (!DEBUG_ON) return;
    this.cellMode = on;
    this.closePalette();
    this.refresh();
  }

  private resizeCells(dw: number, dh: number) { this.cell.resize(this.cell.w + dw, this.cell.h + dh); this.refresh(); }

  private exportCells() {
    const text = this.cell.exportText();
    try { void navigator.clipboard?.writeText(text); } catch { /* the box below still has the text */ }
    openTextDialog('EXPORT LAYOUT', text, 'Paste into src/data/hullLayouts.ts, then add the hull to the tables in hulls.ts.');
  }

  /** Flies the drawn layout in Free Fly without saving anything (a throw-away hull id that draws with the custom art). */
  flyTest() {
    const problems = this.cell.problems();
    if (problems.length > 0) { sfx.play('denied'); this.toast.show(problems[0], 3000); return; }
    const rows = this.cell.rows();
    const flat = rows.join('');
    const cells = flat.split('_').length - 1;
    setCustomHull(CELL_TEST_HULL, {
      name: 'Cell test', rows, damageMul: 1, lives: 0, coresMul: 1,
      stats: { name: 'Cell test', price: 0, pulsesPerSec: basePulses(cells), shotSpeed: 1, size: sizeOfChunks(Math.ceil(cells / 9)) },
    });
    const grid = withHull(CELL_TEST_HULL, rows);
    if (compile(grid).recipes.length === 0) { this.toast.show(NO_EJECTOR_TEXT); return; }
    this.sm.switchTo(new FlyScreen(this.sm, grid));
  }

  // ------------------------------------------------------------------ palette
  private openPalette(slot: number) {
    this.selectedSlot = slot;
    const ed = this.ed;
    const occupied = () => ed.design().slots[slot] !== null;
    const source: PaletteSource = {
      ids: () => (occupied() ? [REMOVE_TILE, ...CHUNKS.map(c => c.id)] : CHUNKS.map(c => c.id)),
      badge: (id) => (id === REMOVE_TILE ? null : ed.free(id)),
      lock: () => null,
      current: (id) => id === ed.design().slots[slot],
      dot: (id) => id !== REMOVE_TILE && ed.canAfford(id),
      content: (id) => (id === REMOVE_TILE ? removeChunkSheet(CHUNK_BY_ID[ed.design().slots[slot] ?? '']?.name ?? 'the chunk') : chunkSheet(ed, id)),
    };
    sfx.play('pickerOpen');
    this.palette.attach(source, {
      onSelect: () => sfx.play('uiTap'),
      onMessage: (m) => { sfx.play('denied'); this.toast.show(m); },
      onButton: (id, button) => {
        if (button === 'buy') {
          const r = ed.buy(id);
          sfx.play(r.ok ? 'purchase' : 'denied');
          if (!r.ok) this.toast.show(r.error);
          this.palette.refresh();
          this.refresh();
          return;
        }
        const r = id === REMOVE_TILE ? ed.remove(slot) : ed.place(slot, id);
        if (!r.ok) { sfx.play('denied'); this.toast.show(r.error); return; }
        this.closePalette();
        this.refresh();
      },
    });
    this.refresh();
  }

  closePalette() {
    if (this.palette.isOpen) sfx.play('pickerClose');
    this.palette.hide();
    this.selectedSlot = -1;
  }

  // ------------------------------------------------------------------ drawing
  /** Redraws everything that depends on the design, the selection or the mode. */
  refresh() {
    const open = this.store.shipyardOpen;
    this.coresT.text = `${fmtBig(this.store.data.cores)} ${CURRENCY_CORES_NAME}`;
    for (const b of this.designTabs) b.container.visible = !this.cellMode;
    this.designTabs.forEach((b, i) => { b.active = i === this.ed.slot; b.redraw(); });
    for (const b of [this.undoB, this.redoB, this.useB]) b.container.visible = !this.cellMode;
    if (this.cellModeB) this.cellModeB.container.visible = !this.cellMode;
    for (const b of this.cellButtons) b.container.visible = this.cellMode;
    this.undoB.enabled = this.ed.canUndo; this.undoB.redraw();
    this.redoB.enabled = this.ed.canRedo; this.redoB.redraw();
    this.useB.enabled = this.ed.canUse(); this.useB.redraw();

    const g = this.gridG.clear();
    let problems: string[];
    let valid: boolean;
    let first: string;
    let strip: string;
    if (this.cellMode) {
      problems = this.cell.problems();
      valid = problems.length === 0;
      first = valid ? 'VALID' : problems[0];
      strip = `Cell mode (debug) · ${this.cell.w} x ${this.cell.h} · ${this.cell.count('_')} cells · ${this.cell.count('E')} ejectors · no Cores, no ownership`;
      this.nameT.visible = false;
      this.drawCells(g);
      this.hintT.text = 'Tap a cell to change it: outside, buildable, generator, ejector. Export copies ROWS text for hullLayouts.ts.';
    } else {
      problems = this.ed.problems();
      const st = statusText(problems, this.ed.canUse(), open);
      valid = st.valid;
      first = st.text;
      strip = statsText(this.ed.stats());
      this.drawSlots(g, problemSlots(problems));
      this.drawNameBox();
      this.hintT.text = open ? 'Tap a slot to place a chunk. Cores are earned in Free Fly.' : `The Shipyard opens at Frontier ring ${SHIPYARD_UNLOCK_RING}.`;
    }
    this.statusT.text = first;
    this.statusT.style.fill = valid ? UI.color.good : PROBLEM_LINE;
    this.statsT.text = strip;
    this.statsT.position.set(SY_STATUS.x, SY_STATUS.y + this.statusT.height + 4);
    this.hintT.visible = !this.palette.isOpen;
    if (this.palette.isOpen) this.palette.refresh();
  }

  private drawNameBox() {
    const r = nameBoxRect(MAX_DESIGNS);
    drawTileFace(this.gridG, r);
    this.nameT.visible = true;
    this.nameT.text = this.ed.label();
    this.nameT.position.set(r.x + 12, r.y + r.h / 2);
    // A small pencil mark says the box is tappable.
    const px = r.x + r.w - 26, py = r.y + r.h / 2;
    this.gridG.poly([px - 7, py + 7, px - 7, py + 2, px + 3, py - 8, px + 8, py - 3, px - 2, py + 7]).fill(UI.color.textDim);
  }

  private drawSlots(g: Graphics, bad: number[]) {
    const d = this.ed.design();
    for (let i = 0; i < DESIGN_SLOTS * DESIGN_SLOTS; i++) {
      const r = slotRect(i);
      const id = d.slots[i];
      g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).fill(EMPTY_SLOT_FILL).stroke({ color: UI.color.border, width: UI.stroke.thin });
      const c = id ? CHUNK_BY_ID[id] : undefined;
      if (c) drawPattern(g, c.rows, r.x + r.w / 2, r.y + r.h / 2, r.w - 14);
      else {
        // An empty slot: a small plus.
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        g.rect(cx - 8, cy - 1, 16, 2).fill(UI.color.border).rect(cx - 1, cy - 8, 2, 16).fill(UI.color.border);
      }
    }
    for (const i of bad) {
      const r = slotRect(i);
      g.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4).stroke({ color: PROBLEM_LINE, width: 3 });
    }
    if (this.selectedSlot >= 0) {
      const r = slotRect(this.selectedSlot);
      g.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4).stroke({ color: UI.color.selected, width: 3 });
    }
  }

  private drawCells(g: Graphics) {
    const { w, h } = this.cell;
    const m = cellMetrics(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = this.cell.get(x, y);
      const px = m.ox + x * m.size, py = m.oy + y * m.size;
      g.rect(px, py, m.size, m.size).fill(EMPTY_SLOT_FILL).stroke({ color: UI.color.border, width: 1 });
      drawCell(g, ch, px, py, m.size);
    }
  }

  // ------------------------------------------------------------------ input
  init() {
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => this.tap(x, y),
        onDrag: (_dx, dy) => { if (this.palette.isOpen) this.palette.scrollBy(-dy); },
        onPinch: () => {},
        onWheel: (dy, x, y) => { if (this.palette.isOpen && this.palette.inList(x, y)) this.palette.wheel(dy); },
        canDrag: (x, y) => this.palette.isOpen && this.palette.inList(x, y),
      },
    );
    this.gestures.attach();
  }

  tap(x: number, y: number) {
    if (this.palette.isOpen && this.palette.contains(x, y)) { this.palette.tap(x, y); return; }
    const b = this.all.find(bb => bb.container.visible && bb.hit(x, y));
    if (b) {
      if (b.enabled || b === this.useB) { b.flash(); b.spec.onTap(); }
      return;
    }
    if (this.cellMode) {
      const c = cellAtPoint(this.cell.w, this.cell.h, x, y);
      if (c) { this.cell.cycle(c.x, c.y); sfx.play('uiTap'); this.refresh(); }
      return;
    }
    if (inRect(nameBoxRect(MAX_DESIGNS), x, y)) {
      openNameDialog(this.ed.design().name ?? '', (n) => { this.ed.rename(n); this.refresh(); });
      return;
    }
    const slot = slotAtPoint(x, y);
    if (slot < 0) { if (this.palette.isOpen) { this.closePalette(); this.refresh(); } return; }
    if (!this.store.shipyardOpen) { this.toast.show(`The Shipyard opens at Frontier ring ${SHIPYARD_UNLOCK_RING}`); return; }
    if (slot === this.selectedSlot && this.palette.isOpen) { this.closePalette(); this.refresh(); return; }
    this.openPalette(slot);
  }

  update(dt: number) { this.toast.update(dt * 1000); }

  destroy() {
    this.gestures?.detach();
    this.container.destroy({ children: true });
  }

  private installDevHook() {
    if (!DEBUG_ON) return;
    const rectOf = (r: Rect | null | undefined) => (r ? { ...r } : null);
    (window as any).__mgbm = {
      screen: 'shipyard',
      shipyard: this,
      state: () => ({
        slot: this.ed.slot, design: this.ed.design(), selectedSlot: this.selectedSlot, paletteOpen: this.palette.isOpen, cellMode: this.cellMode,
        status: this.statusT.text, stats: this.statsT.text, cores: this.store.data.cores, canUse: this.ed.canUse(), canUndo: this.ed.canUndo, canRedo: this.ed.canRedo,
        toast: this.toast.message, name: this.ed.label(), cell: { w: this.cell.w, h: this.cell.h, rows: this.cell.rows(), problems: this.cell.problems() },
      }),
      slotRect: (i: number) => slotRect(i),
      buttonRect: (id: string) => rectOf(this.all.find(b => b.id === id)?.rect),
      tileRect: (id: string) => rectOf(this.palette.tileScreenRect(id)),
      sheetButtonRect: (id: 'place' | 'buy') => rectOf(this.palette.sheetButtonRect(id)),
      cellRect: (x: number, y: number) => { const m = cellMetrics(this.cell.w, this.cell.h); return { x: m.ox + x * m.size, y: m.oy + y * m.size, w: m.size, h: m.size }; },
      nameBoxRect: () => nameBoxRect(MAX_DESIGNS),
    };
  }
}
