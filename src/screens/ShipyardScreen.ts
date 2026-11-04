import { Container, Graphics } from 'pixi.js';
import { Screen, ScreenManager } from './ScreenManager';
import { FlyScreen } from './FlyScreen';
import { BuildScreen } from './BuildScreen';
import { makeText, Toast, UIButton } from '../builder/ui';
import { VIEW_H, VIEW_W, inRect, Rect } from '../builder/layout';
import { REMOVE_TILE } from '../builder/paletteLogic';
import { PaletteSource, TilePalette } from '../builder/tilePalette';
import { GestureTracker } from '../builder/gestures';
import { enterSandbox, getBuilderModel } from '../builder/session';
import { GridRenderer } from '../builder/gridView';
import { drawToolIcon, ToolIcon } from '../builder/draw';
import { keyAction } from '../builder/keys';
import { textButton, TextButton } from '../ui/hud';
import { drawTileFace } from '../ui/widgets';
import { THEME, UI } from '../ui/theme';
import { fmtBig } from '../ui/format';
import { DEBUG_ON } from '../debug/enabled';
import { sfx } from '../audio';
import { CONFIG } from '../config';
import { clientToGame } from '../input';
import { getProgressStore } from '../econ/progress';
import { compile } from '../engine/compiler';
import { CHUNKS, CHUNK_BY_ID } from '../data/shipChunks';
import { customHullInfo } from '../data/hulls';
import { parseLayout, withHull } from '../game/gridUtils';
import { CellEditor } from '../shipyard/cellMode';
import { drawChunkFace } from '../shipyard/chunkArt';
import { CELL_TEST_HULL, CURRENCY_CORES_NAME, DESIGN_SLOTS, MAX_DESIGNS, SHIPYARD_UNLOCK_RING } from '../shipyard/constants';
import { assemble } from '../shipyard/design';
import { openNameDialog, openTextDialog } from '../shipyard/dialogs';
import { ShipyardEditor } from '../shipyard/editor';
import { registerCellTest, rememberCells, takeRememberedCells } from '../shipyard/sandbox';
import {
  cellAtPoint, cellMetrics, chunkSheet, designTabRects, generatorRect, gridView, nameBoxRect, problemSlots, removeChunkSheet, slotAtPoint, slotRect, statsText, statusText,
  SY_ERROR, SY_HEADER_H, SY_PALETTE, SY_STATS, SY_TOOLBAR, SY_USE,
} from '../shipyard/viewLogic';
import { goToTab } from '../map/tabs';
import { NO_EJECTOR_TEXT } from '../map/nav';

const PROBLEM_LINE = 0xd96a5a;

/** Options of a new Shipyard screen: `cellMode` opens in debug cell mode (the sandbox's EXIT returns there, with the layout it had). */
export interface ShipyardOptions { cellMode?: boolean }

/**
 * The Shipyard (chunk 31b, reworked in 31c to work like the circuit builder): the grid is the builder's own cell drawing (`GridRenderer`) of the ship that the 4 x 4 chunk slots
 * assemble, with the fixed generator drawn as the 13th row under it. Tap a slot to select it (the builder's yellow selection) and open the palette sheet (tap a chunk tile to
 * select it, tap it again to place it; Buy in the sheet), then Clear / Rotate left / Rotate right on the builder-style toolbar (or D, Q, R). The stats strip and an error line sit
 * below the grid. With ?debug=1 a Cell mode draws a hull layout cell by cell (validated, exported as ROWS text, flown without saving, or opened in the real builder as a
 * sandbox). The rules are in shipyard/ (pure), this file is the Pixi side.
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
  private gridR = new GridRenderer();
  /** The grid slot that is selected (and the palette is for while it is open), or -1. */
  selectedSlot = -1;
  cellMode = false;
  private overlayG = new Graphics();
  private chromeG = new Graphics();
  private titleT = makeText('SHIPYARD', UI.text.title, UI.color.text, { fontWeight: 'bold' });
  private coresT = makeText('', UI.text.header, UI.color.accent, { fontWeight: 'bold' });
  private nameT = makeText('', UI.text.header, UI.color.text, { fontWeight: 'bold' });
  private errorT = makeText('', 15, UI.color.text, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: SY_ERROR.w, lineHeight: 18 });
  private statsT = makeText('', 14, UI.color.text, { fontWeight: 'bold' });
  private designTabs: TextButton[] = [];
  private clearB!: UIButton;
  private rotLB!: UIButton;
  private rotRB!: UIButton;
  private undoB!: UIButton;
  private redoB!: UIButton;
  private useB: TextButton;
  private cellModeB: TextButton | null = null;
  private cellButtons: TextButton[] = [];
  private all: UIButton[] = [];
  private offKey: (() => void) | null = null;
  /** The hull the builder was on and the layout it had when the screen opened, to tell on leaving whether the builder must read its hull again. */
  private builderHull: string;
  private builderKey: string;

  constructor(private sm: ScreenManager, opts: ShipyardOptions = {}) {
    const model = getBuilderModel();
    this.builderHull = model.hullId;
    this.builderKey = this.layoutKey(this.builderHull);
    this.container.addChild(new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(UI.color.page));
    this.chromeG.rect(0, 0, VIEW_W, SY_HEADER_H).fill(UI.color.panel).rect(0, SY_HEADER_H - 1, VIEW_W, 1).fill(UI.color.border);
    this.titleT.anchor.set(0, 0.5); this.titleT.position.set(64, 27);
    this.coresT.anchor.set(1, 0.5); this.coresT.position.set(VIEW_W - 14, 27);
    this.nameT.anchor.set(0, 0.5);
    this.errorT.position.set(SY_ERROR.x, SY_ERROR.y);
    this.container.addChild(this.chromeG, this.titleT, this.coresT, this.gridR.container, this.overlayG, this.nameT, this.errorT, this.statsT);

    this.add(textButton('shipyardBack', { x: 6, y: 6, w: 46, h: 40 }, '<', () => this.leave(), 24));
    for (let i = 0; i < MAX_DESIGNS; i++) {
      const r = designTabRects(MAX_DESIGNS)[i];
      this.designTabs.push(this.add(textButton(`design${i + 1}`, { x: r.x, y: r.y, w: r.w - 4, h: r.h }, String(i + 1), () => this.switchDesign(i), 22)));
    }
    // Design-mode toolbar, in the builder's style (five 108 px buttons with an icon and a label): Clear, Rotate left, Rotate right, Undo, Redo; and the big Use button.
    const tools: { id: string; icon: ToolIcon; label: string; act: () => void }[] = [
      { id: 'clearCell', icon: 'clear', label: 'Clear', act: () => this.clearSlot() },
      { id: 'rotCCW', icon: 'ccw', label: 'Rotate left', act: () => this.rotate(-1) },
      { id: 'rotCW', icon: 'cw', label: 'Rotate right', act: () => this.rotate(1) },
      { id: 'undo', icon: 'undo', label: 'Undo', act: () => this.undo() },
      { id: 'redo', icon: 'redo', label: 'Redo', act: () => this.redo() },
    ];
    const made = tools.map((d, i) => this.add(this.toolButton(d.id, { x: i * 108, y: SY_TOOLBAR.y + 2, w: 108, h: SY_TOOLBAR.h - 2 }, d.icon, d.label, d.act)));
    [this.clearB, this.rotLB, this.rotRB, this.undoB, this.redoB] = made;
    const useW = DEBUG_ON ? SY_USE.w - 190 : SY_USE.w;
    this.useB = this.add(textButton('use', { ...SY_USE, w: useW }, 'Use this ship', () => this.use(), 20));
    if (DEBUG_ON) {
      this.cellModeB = this.add(textButton('cellMode', { x: SY_USE.x + useW + 6, y: SY_USE.y, w: 184, h: SY_USE.h }, 'Cell mode', () => this.setCellMode(true), 18));
      // Cell-mode toolbars (debug only): size and export above, the three flights below.
      const row1: [string, string, number, () => void][] = [
        ['cellWminus', 'W-', 80, () => this.resizeCells(-1, 0)], ['cellWplus', 'W+', 80, () => this.resizeCells(1, 0)],
        ['cellHminus', 'H-', 80, () => this.resizeCells(0, -1)], ['cellHplus', 'H+', 80, () => this.resizeCells(0, 1)],
        ['cellExport', 'Export', 150, () => this.exportCells()],
      ];
      let x = 10;
      for (const [id, label, w, fn] of row1) {
        this.cellButtons.push(this.add(textButton(id, { x, y: SY_TOOLBAR.y, w, h: SY_TOOLBAR.h }, label, fn, 16)));
        x += w + 6;
      }
      const row2: [string, string, number, () => void][] = [
        ['cellFly', 'Fly test', 130, () => this.flyTest()], ['cellSandbox', 'Build & fly', 190, () => this.buildAndFly()], ['cellExit', 'Chunks', 160, () => this.setCellMode(false)],
      ];
      x = 10;
      for (const [id, label, w, fn] of row2) {
        this.cellButtons.push(this.add(textButton(id, { x, y: SY_USE.y, w, h: SY_USE.h }, label, fn, 18)));
        x += w + 6;
      }
    }
    this.palette = new TilePalette({ area: SY_PALETTE, buttons: ['buy'], tapAgain: 'place', panel: true, drawFace: drawChunkFace });
    this.palette.hide();
    for (const b of this.all) this.container.addChild(b.container);
    // The palette sheet is above the buttons it covers.
    this.container.addChild(this.palette.container);
    this.container.addChild(this.toast.container);
    // Back from the sandbox: cell mode again, with the layout it had.
    if (DEBUG_ON && opts.cellMode) {
      const snap = takeRememberedCells();
      if (snap) { this.cell.resize(snap.w, snap.h); snap.rows.forEach((r, y) => [...r].forEach((ch, x) => this.cell.set(x, y, ch))); }
      this.cellMode = true;
    }
    this.refresh();
    this.installDevHook();
  }

  private add<T extends UIButton>(b: T): T { this.all.push(b); return b; }

  /** A toolbar button like the builder's: flat face, an icon over a small label, greyed when disabled. */
  private toolButton(id: string, rect: Rect, icon: ToolIcon, label: string, onTap: () => void): UIButton {
    return new UIButton({
      id, rect, label, labelSize: 11, labelColor: THEME.text, onTap,
      draw: (g: Graphics, b: UIButton) => {
        const { w, h } = b.rect;
        const off = !b.enabled;
        g.rect(1, 1, w - 2, h - 2).fill(b.lit ? THEME.pressedFill : THEME.buttonFill).stroke({ color: off ? THEME.disabled : THEME.buttonLine, width: 1.5 });
        const ic = new Graphics();
        drawToolIcon(ic, icon, 26, off ? THEME.disabled : b.lit ? THEME.pressedIcon : THEME.buttonIcon);
        ic.position.set(w / 2, 18);
        g.addChild(ic);
      },
    });
  }

  // ------------------------------------------------------------------ actions
  private switchDesign(i: number) {
    if (this.cellMode) return;
    this.ed.switchSlot(i);
    this.closePalette();
    this.selectedSlot = -1;
    this.refresh();
  }

  undo() { const r = this.ed.undo(); if (r.ok) sfx.play('uiTap'); this.closePalette(); this.refresh(); }
  redo() { const r = this.ed.redo(); if (r.ok) sfx.play('uiTap'); this.closePalette(); this.refresh(); }

  /** Rotates the chunk in the selected slot a quarter turn (+1 right, -1 left). */
  rotate(steps: 1 | -1) {
    if (this.cellMode || this.selectedSlot < 0) return;
    const r = this.ed.rotate(this.selectedSlot, steps);
    if (!r.ok) { sfx.play('denied'); this.toast.show(r.error); return; }
    sfx.play('uiTap');
    this.refresh();
  }

  /** Takes the chunk out of the selected slot. */
  clearSlot() {
    if (this.cellMode || this.selectedSlot < 0) return;
    const r = this.ed.remove(this.selectedSlot);
    if (!r.ok) { sfx.play('denied'); this.toast.show(r.error); return; }
    sfx.play('uiTap');
    this.closePalette();
    this.refresh();
  }

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
    this.selectedSlot = -1;
    this.refresh();
  }

  private resizeCells(dw: number, dh: number) { this.cell.resize(this.cell.w + dw, this.cell.h + dh); this.refresh(); }

  private exportCells() {
    const text = this.cell.exportText();
    try { navigator.clipboard?.writeText(text).catch(() => { /* not allowed here: the box below has the text */ }); } catch { /* the box below still has the text */ }
    openTextDialog('EXPORT LAYOUT', text, 'Paste into src/data/hullLayouts.ts, then add the hull to the tables in hulls.ts.');
  }

  /** Flies the drawn layout in Free Fly without saving anything (a throw-away hull id that draws with the custom art). */
  flyTest() {
    const problems = this.cell.problems();
    if (problems.length > 0) { sfx.play('denied'); this.toast.show(problems[0], 3000); return; }
    const rows = this.cell.rows();
    registerCellTest(rows);
    const grid = withHull(CELL_TEST_HULL, rows);
    if (compile(grid).recipes.length === 0) { this.toast.show(NO_EJECTOR_TEXT); return; }
    this.sm.switchTo(new FlyScreen(this.sm, grid));
  }

  /**
   * "Build & fly" (debug): the drawn layout opens in the real circuit builder as a temporary hull in a sandbox (every block free, a SANDBOX banner, nothing saved), so a circuit
   * can be built in it and flown in Free Fly or any campaign tier. EXIT on the banner returns here, in cell mode, with the layout intact.
   */
  buildAndFly() {
    const problems = this.cell.problems();
    if (problems.length > 0) { sfx.play('denied'); this.toast.show(problems[0], 3000); return; }
    rememberCells({ w: this.cell.w, h: this.cell.h, rows: this.cell.rawRows() });
    enterSandbox(this.cell.rows());
    this.sm.switchTo(new BuildScreen(this.sm));
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
        this.closePalette(); // the slot stays selected: Rotate and Clear are on the toolbar
        this.refresh();
      },
    });
    this.refresh();
  }

  /** Closes the palette sheet; the slot stays selected. */
  closePalette() {
    if (this.palette.isOpen) sfx.play('pickerClose');
    this.palette.hide();
  }

  // ------------------------------------------------------------------ drawing
  /** Redraws everything that depends on the design, the selection or the mode. */
  refresh() {
    const open = this.palette.isOpen;
    this.coresT.text = `${fmtBig(this.store.data.cores)} ${CURRENCY_CORES_NAME}`;
    for (const b of this.designTabs) b.container.visible = !this.cellMode;
    this.designTabs.forEach((b, i) => { b.active = i === this.ed.slot; b.redraw(); });
    for (const b of [this.clearB, this.rotLB, this.rotRB, this.undoB, this.redoB, this.useB]) b.container.visible = !this.cellMode;
    if (this.cellModeB) this.cellModeB.container.visible = !this.cellMode;
    for (const b of this.cellButtons) b.container.visible = this.cellMode;
    const hasChunk = this.selectedSlot >= 0 && this.ed.design().slots[this.selectedSlot] !== null;
    this.clearB.setEnabled(hasChunk); this.rotLB.setEnabled(hasChunk); this.rotRB.setEnabled(hasChunk);
    this.undoB.setEnabled(this.ed.canUndo); this.redoB.setEnabled(this.ed.canRedo);
    this.useB.enabled = this.ed.canUse(); this.useB.redraw();

    let problems: string[];
    let valid: boolean;
    let first: string;
    let strip: string;
    let rows: string[];
    if (this.cellMode) {
      problems = this.cell.problems();
      valid = problems.length === 0;
      first = valid ? 'VALID' : problems[0];
      strip = `Cell mode (debug) · ${this.cell.w} x ${this.cell.h} · ${this.cell.count('_')} cells · ${this.cell.count('E')} ejectors · no Cores, no ownership`;
      this.nameT.visible = false;
      rows = this.cell.rawRows();
    } else {
      problems = this.ed.problems();
      const st = statusText(problems, this.ed.canUse(), this.store.shipyardOpen);
      valid = st.valid;
      first = st.text;
      strip = statsText(this.ed.stats());
      if (!this.store.shipyardOpen) strip = `The Shipyard opens at Frontier ring ${SHIPYARD_UNLOCK_RING}`;
      rows = assemble(this.ed.design());
    }
    this.errorT.text = first;
    this.errorT.style.fill = valid ? UI.color.good : PROBLEM_LINE;
    this.statsT.text = strip;
    this.statsT.position.set(10, SY_STATS.y + 9);
    this.drawStrip();
    this.drawGrid(rows, open, this.cellMode ? [] : problemSlots(problems));
    if (open) this.palette.refresh();
  }

  /** The stats strip behind the stats text: the builder's panel strip. */
  private drawStrip() {
    const r = SY_STATS;
    this.chromeG.clear()
      .rect(0, 0, VIEW_W, SY_HEADER_H).fill(UI.color.panel).rect(0, SY_HEADER_H - 1, VIEW_W, 1).fill(UI.color.border)
      .rect(r.x, r.y, r.w, r.h).fill(THEME.panel).rect(r.x, r.y, r.w, 1).fill(THEME.border)
      .rect(SY_TOOLBAR.x, SY_TOOLBAR.y, SY_TOOLBAR.w, SY_TOOLBAR.h).fill(THEME.panel).rect(SY_TOOLBAR.x, SY_TOOLBAR.y, SY_TOOLBAR.w, 1).fill(THEME.border);
  }

  private drawNameBox() {
    const r = nameBoxRect(MAX_DESIGNS);
    const g = this.overlayG;
    drawTileFace(g, r);
    this.nameT.visible = true;
    this.nameT.text = this.ed.label();
    this.nameT.position.set(r.x + 12, r.y + r.h / 2);
    // A small pencil mark says the box is tappable.
    const px = r.x + r.w - 26, py = r.y + r.h / 2;
    g.poly([px - 7, py + 7, px - 7, py + 2, px + 3, py - 8, px + 8, py - 3, px - 2, py + 7]).fill(UI.color.textDim);
  }

  /** The builder's own cell drawing of the assembled ship (or of the cell-mode layout), then the slot lines, the selected slot and the problem slots over it. */
  private drawGrid(rows: string[], open: boolean, bad: number[]) {
    const grid = parseLayout(rows);
    const compiled = compile(grid);
    const view = this.cellMode ? null : gridView(open);
    const cm = this.cellMode ? cellMetrics(this.cell.w, this.cell.h, open) : null;
    this.gridR.setView(view ?? { scale: cm!.size, ox: cm!.ox, oy: cm!.oy });
    this.gridR.render(grid, compiled, { selected: null });
    const g = this.overlayG;
    g.clear();
    if (this.cellMode) return;
    this.drawNameBox();
    const d = this.ed.design();
    // Chunk slot lines: thin lines every three cells, and a small plus in an empty slot.
    for (let i = 0; i < DESIGN_SLOTS * DESIGN_SLOTS; i++) {
      const r = slotRect(i, open);
      g.rect(r.x, r.y, r.w, r.h).stroke({ color: UI.color.border, width: 1 });
      if (d.slots[i] === null) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        g.rect(cx - 8, cy - 1, 16, 2).fill(UI.color.border).rect(cx - 1, cy - 8, 2, 16).fill(UI.color.border);
      }
    }
    for (const i of bad) {
      const r = slotRect(i, open);
      g.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 4).stroke({ color: PROBLEM_LINE, width: 3 });
    }
    if (this.selectedSlot >= 0) {
      const r = slotRect(this.selectedSlot, open);
      g.rect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).stroke({ color: THEME.select, width: THEME.selectWidth });
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
    // The builder's keys: R / Q / Shift+R rotate, D / Delete / Backspace clear, Ctrl+Z / Ctrl+Y undo / redo, Esc closes the sheet, then deselects.
    const onKey = (e: KeyboardEvent) => {
      const a = keyAction({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, repeat: e.repeat, target: e.target as HTMLElement | null });
      if (!a) return;
      if (this.keyAction(a)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    this.offKey = () => window.removeEventListener('keydown', onKey);
  }

  /** Does what a builder key means here; true when the key was used. */
  keyAction(a: ReturnType<typeof keyAction>): boolean {
    if (this.cellMode) return false;
    switch (a) {
      case 'rotateRight': this.rotate(1); return true;
      case 'rotateLeft': this.rotate(-1); return true;
      case 'delete': this.clearSlot(); return true;
      case 'undo': this.undo(); return true;
      case 'redo': this.redo(); return true;
      case 'escape':
        if (this.palette.isOpen) this.closePalette(); else this.selectedSlot = -1;
        this.refresh();
        return true;
      default: return false;
    }
  }

  tap(x: number, y: number) {
    if (this.palette.isOpen && this.palette.contains(x, y)) { this.palette.tap(x, y); return; }
    const b = this.all.find(bb => bb.container.visible && bb.hit(x, y));
    if (b) {
      if (b.enabled || b === this.useB) { b.flash(); b.spec.onTap(); }
      return;
    }
    const open = this.palette.isOpen;
    if (this.cellMode) {
      const c = cellAtPoint(this.cell.w, this.cell.h, x, y, open);
      if (c) { this.cell.cycle(c.x, c.y); sfx.play('uiTap'); this.refresh(); }
      return;
    }
    if (inRect(nameBoxRect(MAX_DESIGNS), x, y)) {
      openNameDialog(this.ed.design().name ?? '', (n) => { this.ed.rename(n); this.refresh(); });
      return;
    }
    const slot = slotAtPoint(x, y, open);
    if (slot < 0) {
      if (inRect(generatorRect(open), x, y)) { this.toast.show('The generator is fixed. It fires up into the cell above it.', 2600); return; }
      if (open) this.closePalette();
      this.selectedSlot = -1;
      this.refresh();
      return;
    }
    if (!this.store.shipyardOpen) { this.toast.show(`The Shipyard opens at Frontier ring ${SHIPYARD_UNLOCK_RING}`); return; }
    if (slot === this.selectedSlot && open) { this.closePalette(); this.refresh(); return; }
    this.openPalette(slot);
  }

  update(dt: number) {
    this.toast.update(dt * 1000);
    this.gridR.tick(performance.now());
  }

  destroy() {
    this.gestures?.detach();
    this.offKey?.();
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
        status: this.errorT.text, stats: this.statsT.text, cores: this.store.data.cores, canUse: this.ed.canUse(), canUndo: this.ed.canUndo, canRedo: this.ed.canRedo,
        toast: this.toast.message, name: this.ed.label(), cell: { w: this.cell.w, h: this.cell.h, rows: this.cell.rows(), problems: this.cell.problems() },
        rotations: Array.from({ length: DESIGN_SLOTS * DESIGN_SLOTS }, (_, i) => this.ed.rotationOf(i)),
      }),
      slotRect: (i: number) => slotRect(i, this.palette.isOpen),
      generatorRect: () => generatorRect(this.palette.isOpen),
      buttonRect: (id: string) => rectOf(this.all.find(b => b.id === id)?.rect),
      tileRect: (id: string) => rectOf(this.palette.tileScreenRect(id)),
      sheetButtonRect: (id: 'place' | 'buy') => rectOf(this.palette.sheetButtonRect(id)),
      cellRect: (x: number, y: number) => { const m = cellMetrics(this.cell.w, this.cell.h, this.palette.isOpen); return { x: m.ox + x * m.size, y: m.oy + y * m.size, w: m.size, h: m.size }; },
      nameBoxRect: () => nameBoxRect(MAX_DESIGNS),
    };
  }
}

