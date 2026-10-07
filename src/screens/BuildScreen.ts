import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { Screen, ScreenManager } from './ScreenManager';
import { FlyScreen } from './FlyScreen';
import { clientToGame } from '../input';
import { BLOCKS, MOD_LABEL } from '../data/blocks';
import { HULL_INFO } from '../game/gridUtils';
import { describeBlock, rotationToDir } from '../engine/compilerTypes';
import { CompiledShip, Grid } from '../engine/compiler';
import { BuilderModel, statsDelta } from '../builder/model';
import { getBuilderModel } from '../builder/session';
import { GestureTracker } from '../builder/gestures';
import { GridRenderer } from '../builder/gridView';
import {
  cellFromPoint, clampView, fitView, inRect, LAYOUT, MIN_TAP, panBy, panToReveal, View, VIEW_H, VIEW_W, zoomAt,
} from '../builder/layout';
import {
  COLORS, drawTabIcon, drawToolIcon, TabIcon, ToolIcon,
} from '../builder/draw';
import { InfoPanel, Inspector, makeText, StatsStrip, Toast, UIButton } from '../builder/ui';
import { Rect } from '../builder/layout';
import { Picker, REMOVE_TILE } from '../builder/picker';

const HOVER_MS = 800;

function fmtNum(n: number): string {
  return Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(1);
}

function cellCenterOf(v: View, cx: number, cy: number) {
  return { x: v.ox + (cx + 0.5) * v.scale, y: v.oy + (cy + 0.5) * v.scale };
}

const FACING_WORD: Record<string, string> = { N: 'up', E: 'right', S: 'down', W: 'left' };
const HELP_TEXT =
  'Tap a cell to inspect it. Double-tap an empty cell to open the block picker; tap a tile to preview it, double-tap it to place it.\n\n' +
  'The red line is automatic: it leaves the generator and runs straight until a block changes it, ending at an ejector. ' +
  'Blocks on the line follow it (auto). Rotate a block to lock its facing (padlock); Auto-orient makes it follow the line again.\n\n' +
  'Drag to pan, pinch or use the wheel to zoom, and use the corner-arrows button to fit the hull.';

/**
 * The circuit builder. All state lives in BuilderModel; this screen only renders it and turns
 * pointer gestures into model edits.
 */
export class BuildScreen implements Screen {
  container = new Container();
  readonly model: BuilderModel;
  view: View;
  selected: { x: number; y: number } | null = null;

  private gridR = new GridRenderer();
  private toast = new Toast();
  private inspector = new Inspector();
  private stats = new StatsStrip();
  private info = new InfoPanel();
  private picker = new Picker();
  private dim = new Graphics();
  private buttons: UIButton[] = [];
  private toolbar: Record<string, UIButton> = {};
  private abButton!: UIButton;
  private undoButton!: UIButton;
  private redoButton!: UIButton;
  private gestures: GestureTracker | null = null;
  private unsubscribe: (() => void) | null = null;
  private preview: { x: number; y: number; blockId: string | null; grid: Grid; compiled: CompiledShip } | null = null;
  private viewBeforePicker: View | null = null;
  private tip = new Container();
  private tipBg = new Graphics();
  private tipText = makeText('', 13, 0xffffff, { lineHeight: 17 });
  private hover: { x: number; y: number; since: number } | null = null;
  private hullPanel = new Container();
  private hullRows: { id: string; rect: Rect }[] = [];

  constructor(private sm: ScreenManager) {
    this.model = getBuilderModel();
    this.view = fitView(this.model.grid.w, this.model.grid.h);

    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(COLORS.bg);
    this.container.addChild(bg, this.gridR.container);
    this.buildHud();
    this.dim.rect(0, LAYOUT.gridArea.y, VIEW_W, LAYOUT.sheet.y - LAYOUT.gridArea.y).fill({ color: 0x000000, alpha: 0.28 });
    this.dim.visible = false;
    this.tip.visible = false;
    this.tip.addChild(this.tipBg, this.tipText);
    this.hullPanel.visible = false;
    this.container.addChild(this.dim, this.picker.container, this.stats.container, this.tip, this.hullPanel, this.info.container, this.toast.container);

    this.gridR.setView(this.view);
    this.refresh();
    this.installDevHook();
  }

  // ------------------------------------------------------------------ lifecycle
  init() {
    this.gestures = new GestureTracker(
      this.sm.app.canvas as HTMLCanvasElement,
      (cx, cy) => clientToGame(cx, cy, this.sm.app.canvas.getBoundingClientRect(), CONFIG.VIEW.W, CONFIG.VIEW.H),
      {
        onTap: (x, y) => this.handleTap(x, y),
        onDoubleTap: (x, y) => this.handleDoubleTap(x, y),
        onDrag: (dx, dy) => this.handleDrag(dx, dy),
        onPinch: (f, cx, cy) => this.zoom(f, cx, cy),
        onWheel: (dy, x, y) => this.handleWheel(dy, x, y),
        canDrag: (x, y) => this.canDrag(x, y),
        onMove: (x, y) => this.handleHover(x, y),
        onLongPress: (x, y) => this.handleLongPress(x, y),
        onLongPressEnd: () => this.hideTip(),
      },
    );
    this.gestures.attach();
    this.unsubscribe = this.model.onChange(() => this.refresh());
  }

  destroy() {
    this.gestures?.detach();
    this.unsubscribe?.();
    this.container.destroy({ children: true });
  }

  update(dt: number, _frameTime: number, now: number) {
    this.gridR.tick(now);
    this.toast.update(dt * 1000);
    if (this.hover && !this.tip.visible && performance.now() - this.hover.since > HOVER_MS) this.showLedger(this.hover.x, this.hover.y);
  }

  // ------------------------------------------------------------------ HUD construction
  private addButton(b: UIButton, parent: Container = this.container) {
    this.buttons.push(b);
    parent.addChild(b.container);
    return b;
  }

  private roundFace(g: Graphics, b: UIButton, icon: ToolIcon, color = COLORS.red) {
    const { w, h } = b.rect;
    g.roundRect(1, 1, w - 2, h - 2, 10).fill({ color: 0x1f1f1f, alpha: 0.82 }).stroke({ color: 0x000000, width: 1.5, alpha: 0.7 });
    const ic = new Graphics();
    drawToolIcon(ic, icon, Math.min(w, h) * 0.55, color);
    ic.position.set(w / 2, h / 2);
    g.addChild(ic);
  }

  private buildHud() {
    const top = LAYOUT.top;
    const hud = new Graphics()
      .rect(top.x, top.y, top.w, top.h).fill(0x4f4f4f).rect(0, top.h - 1, VIEW_W, 1).fill(0x1a1a1a)
      .rect(LAYOUT.toolbar.x, LAYOUT.toolbar.y, LAYOUT.toolbar.w, LAYOUT.toolbar.h).fill(0x2b2b2b)
      .rect(LAYOUT.toolbar.x, LAYOUT.toolbar.y, LAYOUT.toolbar.w, 2).fill(0x7a1c1c)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(0x202020)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(0x000000);
    this.container.addChild(hud, this.inspector.container);

    const mode = makeText('Select', 32, COLORS.red, { fontWeight: 'bold', dropShadow: { color: 0x000000, alpha: 0.7, distance: 2, blur: 1, angle: Math.PI / 3 } });
    mode.anchor.set(0.5);
    mode.position.set(VIEW_W / 2, 27);
    const money = makeText('0', 28, COLORS.magenta, { fontWeight: 'bold', dropShadow: { color: 0x000000, alpha: 0.6, distance: 2, blur: 1, angle: Math.PI / 3 } });
    money.anchor.set(1, 0.5);
    money.position.set(VIEW_W - 12, 27);
    this.container.addChild(mode, money);

    // Top bar buttons.
    this.addButton(new UIButton({
      id: 'ship', rect: { x: 6, y: 4, w: 44, h: 44 }, onTap: () => this.openHullPanel(),
      draw: (g, b) => { g.circle(22, 22, 21).fill(0x707070).stroke({ color: 0x1b1b1b, width: 2 }); const ic = new Graphics(); drawToolIcon(ic, 'ship', 30, 0xffffff); ic.position.set(22, 22); g.addChild(ic); void b; },
    }));
    this.addButton(new UIButton({
      id: 'help', rect: { x: 56, y: 4, w: 44, h: 44 }, onTap: () => this.info.show('How the builder works', HELP_TEXT),
      draw: (g, b) => { g.circle(22, 22, 21).fill(0x707070).stroke({ color: 0x1b1b1b, width: 2 }); const ic = new Graphics(); drawToolIcon(ic, 'help', 28, 0xeeeeee); ic.position.set(22, 22); g.addChild(ic); void b; },
    }));

    // Grid corner buttons.
    const row = (i: number, fromRight = false) => ({
      x: fromRight ? VIEW_W - 6 - 44 - i * 48 : 6 + i * 48, y: LAYOUT.gridArea.y + 6, w: MIN_TAP, h: MIN_TAP,
    });
    this.addButton(new UIButton({ id: 'fit', rect: row(0), onTap: () => this.fit(), draw: (g, b) => this.roundFace(g, b, 'fit', 0xffffff) }));
    this.undoButton = this.addButton(new UIButton({ id: 'undo', rect: row(1), onTap: () => this.undo(), draw: (g, b) => this.roundFace(g, b, 'undo', 0xffffff) }));
    this.redoButton = this.addButton(new UIButton({ id: 'redo', rect: row(2), onTap: () => this.redo(), draw: (g, b) => this.roundFace(g, b, 'redo', 0xffffff) }));
    this.abButton = this.addButton(new UIButton({
      id: 'ab', rect: row(0, true), onTap: () => this.toggleSlot(),
      draw: (g, b) => {
        const { w, h } = b.rect;
        g.roundRect(1, 1, w - 2, h - 2, 10).fill({ color: 0x1f1f1f, alpha: 0.82 }).stroke({ color: COLORS.red, width: 2 });
      },
    }));
    this.abLabel = makeText('A', 28, COLORS.red, { fontWeight: 'bold' });
    this.abLabel.anchor.set(0.5);
    this.abLabel.position.set(22, 22);
    this.abButton.container.addChild(this.abLabel);
    this.addButton(new UIButton({ id: 'paste', rect: row(1, true), onTap: () => void this.pasteLayout(), draw: (g, b) => this.roundFace(g, b, 'paste', 0xffffff) }));
    this.addButton(new UIButton({ id: 'copy', rect: row(2, true), onTap: () => void this.copyLayout(), draw: (g, b) => this.roundFace(g, b, 'copy', 0xffffff) }));

    // Toolbar: Clear cell, Rotate CCW, Auto-orient, Rotate CW, Clear all.
    const defs: { id: string; icon: ToolIcon; label: string; act: () => void; needsBlock: boolean }[] = [
      { id: 'clearCell', icon: 'clear', label: 'Clear cell', act: () => this.clearCell(), needsBlock: true },
      { id: 'rotCCW', icon: 'ccw', label: 'Rotate left', act: () => this.rotate(-1), needsBlock: true },
      { id: 'auto', icon: 'auto', label: 'Auto-orient', act: () => this.autoOrient(), needsBlock: true },
      { id: 'rotCW', icon: 'cw', label: 'Rotate right', act: () => this.rotate(1), needsBlock: true },
      { id: 'clearAll', icon: 'clearAll', label: 'Clear all', act: () => this.clearAll(), needsBlock: false },
    ];
    defs.forEach((d, i) => {
      const b = new UIButton({
        id: d.id, rect: { x: i * 108, y: LAYOUT.toolbar.y + 2, w: 108, h: LAYOUT.toolbar.h - 2 }, label: d.label, labelSize: 11, labelColor: 0xd8a0a0,
        onTap: d.act,
        draw: (g, bb) => {
          const ic = new Graphics();
          drawToolIcon(ic, d.icon, 26, COLORS.red);
          ic.position.set(bb.rect.w / 2, 18);
          g.addChild(ic);
        },
      });
      this.toolbar[d.id] = this.addButton(b);
    });

    // FLY pill.
    const fly = new UIButton({
      id: 'fly', rect: { x: VIEW_W - 134, y: LAYOUT.gridArea.y + LAYOUT.gridArea.h - 54, w: 124, h: 46 }, onTap: () => this.fly(),
      draw: (g, b) => {
        g.roundRect(0, 0, b.rect.w, b.rect.h, 23).fill(0xd8221a).stroke({ color: 0xffffff, width: 2.5, alpha: 0.9 });
        g.poly([86, 12, 86, 34, 104, 23]).fill(0xffffff);
      },
    });
    const flyLabel = makeText('FLY', 24, 0xffffff, { fontWeight: 'bold' });
    flyLabel.anchor.set(0.5);
    flyLabel.position.set(46, 23);
    fly.container.addChild(flyLabel);
    this.addButton(fly);

    // Tab bar.
    const tabs: { id: string; icon: TabIcon; label: string; color: number }[] = [
      { id: 'tabBuild', icon: 'build', label: 'Build', color: COLORS.red },
      { id: 'tabShop', icon: 'shop', label: 'Shop', color: COLORS.magenta },
      { id: 'tabCaptain', icon: 'captain', label: 'Captain', color: COLORS.yellow },
      { id: 'tabSkills', icon: 'skills', label: 'Skills', color: COLORS.orange },
      { id: 'tabMap', icon: 'map', label: 'Map', color: COLORS.cyan },
    ];
    tabs.forEach((t, i) => {
      const active = i === 0;
      this.addButton(new UIButton({
        id: t.id, rect: { x: i * 108, y: LAYOUT.tabs.y + 1, w: 108, h: LAYOUT.tabs.h - 1 }, label: t.label, labelSize: 12, labelColor: t.color,
        onTap: () => { if (!active) this.toast.show('Coming soon'); },
        draw: (g, b) => {
          if (active) {
            g.rect(0, 0, b.rect.w, b.rect.h).fill({ color: t.color, alpha: 0.14 });
            g.rect(0, b.rect.h - 4, b.rect.w, 4).fill(t.color);
          }
          const ic = new Graphics();
          drawTabIcon(ic, t.icon, 26, t.color);
          ic.position.set(b.rect.w / 2, 20);
          ic.alpha = active ? 1 : 0.8;
          g.addChild(ic);
        },
      }));
    });
  }

  private abLabel!: ReturnType<typeof makeText>;

  // ------------------------------------------------------------------ rendering
  /** Redraws everything that depends on the model, the selection or the picker preview. */
  refresh() {
    this.hideTip();
    const src = this.preview ?? { grid: this.model.grid, compiled: this.model.compiled };
    this.gridR.render(src.grid, src.compiled, { selected: this.selected, ghost: this.preview ? { x: this.preview.x, y: this.preview.y } : null });
    const delta = this.preview ? statsDelta(this.model.compiled.stats, this.preview.compiled.stats) : undefined;
    this.stats.set(src.compiled.stats, delta);
    this.abLabel.text = this.model.active;
    this.undoButton.setEnabled(this.model.canUndo);
    this.redoButton.setEnabled(this.model.canRedo);
    const hasBlock = !!this.selectedBlockCell();
    for (const id of ['clearCell', 'rotCCW', 'auto', 'rotCW']) this.toolbar[id].setEnabled(hasBlock);
    this.toolbar.clearAll.setEnabled(true);
    if (!this.preview) this.updateInspector();
  }

  private selectedBlockCell() {
    if (!this.selected) return null;
    const c = this.model.cellAt(this.selected.x, this.selected.y);
    return c && c.type === 'empty' && c.blockId ? c : null;
  }

  private updateInspector() {
    const sel = this.selected;
    if (!sel) {
      this.inspector.set('Circuit builder', 'Tap a cell to inspect it. Double-tap an empty cell to build. The red line runs from the generator to an ejector.');
      return;
    }
    const cell = this.model.cellAt(sel.x, sel.y);
    if (!cell) return;
    switch (cell.type) {
      case 'void':
        this.inspector.set('Empty space', 'Outside the hull. Nothing can be built here.');
        return;
      case 'blocked':
        this.inspector.set('Blocked cell', "A solid block. Projectiles won't pass it.");
        return;
      case 'generator':
        this.inspector.set('Generator', describeBlock(BLOCKS.generator));
        return;
      case 'ejector':
        this.inspector.set('Ejector', describeBlock(BLOCKS.ejector));
        return;
    }
    if (!cell.blockId) {
      this.inspector.set('Empty cell', 'Buildable. The red line passes straight through. Double-tap to build here.');
      return;
    }
    const def = BLOCKS[cell.blockId];
    const info = this.model.compiled.cellInfo[sel.y * this.model.grid.w + sel.x];
    const facing = FACING_WORD[rotationToDir(info.effectiveRotation)];
    const mode = info.orientationMode === 'auto' ? 'Orientation: auto' : `Orientation: manual (facing ${facing})`;
    let body = describeBlock(def, cell.level);
    let color = 0xffffff;
    if (info.warning) {
      body = `Warning: ${info.warning.toLowerCase()}. ${body}`;
      color = COLORS.warn;
    } else if (!info.onPath) {
      body += ' No signal reaches this block.';
    }
    this.inspector.set(`${def.name} · ${mode}`, body, color);
  }

  private installDevHook() {
    if (!import.meta.env.DEV) return;
    (window as any).__mgbm = {
      screen: 'build',
      buildScreen: this,
      model: this.model,
      state: () => ({
        recipes: this.model.compiled.recipes.length,
        damagePerShot: this.model.compiled.recipes.map(r => r.packet.damage),
        stats: this.model.compiled.stats,
        selected: this.selected,
        active: this.model.active,
        view: this.view,
        pickerOpen: this.picker.isOpen,
        toast: this.toast.message,
        inspector: { title: this.inspector.titleText, body: this.inspector.bodyText },
        statsStrip: this.stats.texts(),
        ledger: this.tip.visible ? this.tipText.text : null,
        hull: this.model.hullId,
        hullPanelOpen: this.hullPanel.visible,
      }),
    };
  }

  // ------------------------------------------------------------------ view
  private applyView() {
    this.view = clampView(this.view, this.model.grid.w, this.model.grid.h);
    this.gridR.setView(this.view);
  }

  fit() {
    this.view = fitView(this.model.grid.w, this.model.grid.h);
    this.applyView();
  }

  private zoom(factor: number, cx: number, cy: number) {
    if (this.picker.isOpen || this.info.isOpen) return;
    this.view = zoomAt(this.view, factor, cx, cy);
    this.applyView();
  }

  // ------------------------------------------------------------------ gestures
  private buttonAt(x: number, y: number): UIButton | null {
    for (let i = this.buttons.length - 1; i >= 0; i--) if (this.buttons[i].hit(x, y)) return this.buttons[i];
    return null;
  }

  private canDrag(x: number, y: number): boolean {
    if (this.info.isOpen || this.hullPanel.visible) return false;
    if (this.picker.isOpen) return this.picker.inList(x, y);
    return inRect(LAYOUT.gridArea, x, y) && !this.buttonAt(x, y);
  }

  private handleDrag(dx: number, dy: number) {
    this.hideTip();
    this.hover = null;
    if (this.picker.isOpen) { this.picker.scrollBy(-dy); return; }
    this.view = panBy(this.view, dx, dy);
    this.applyView();
  }

  private handleWheel(deltaY: number, x: number, y: number) {
    if (this.info.isOpen) return;
    if (this.picker.isOpen) { if (this.picker.inList(x, y)) this.picker.wheel(deltaY); return; }
    if (inRect(LAYOUT.gridArea, x, y)) this.zoom(Math.exp(-deltaY * 0.0015), x, y);
  }

  handleTap(x: number, y: number) {
    this.hideTip();
    if (this.hullPanel.visible) { this.tapHullPanel(x, y); return; }
    if (this.info.isOpen) { this.info.hide(); return; }
    if (this.picker.isOpen) {
      if (this.picker.tap(x, y)) return;
      this.closePicker();
      return;
    }
    const b = this.buttonAt(x, y);
    if (b) {
      if (b.enabled) b.spec.onTap();
      else this.disabledHint(b.id);
      return;
    }
    if (this.stats.hit(x, y)) { this.openStatsPanel(); return; }
    if (inRect(LAYOUT.gridArea, x, y)) {
      const c = cellFromPoint(this.view, this.model.grid.w, this.model.grid.h, x, y);
      this.select(c);
    }
  }

  handleDoubleTap(x: number, y: number) {
    this.hideTip();
    if (this.hullPanel.visible) { this.tapHullPanel(x, y); return; }
    if (this.info.isOpen) { this.info.hide(); return; }
    if (this.picker.isOpen) {
      if (this.picker.doubleTap(x, y)) return;
      this.closePicker();
      return;
    }
    if (!this.buttonAt(x, y) && inRect(LAYOUT.gridArea, x, y)) {
      const c = cellFromPoint(this.view, this.model.grid.w, this.model.grid.h, x, y);
      if (c && this.model.cellAt(c.x, c.y)?.type === 'empty') {
        this.select(c);
        this.openPicker(c);
        return;
      }
    }
    this.handleTap(x, y);
  }

  private disabledHint(id: string) {
    if (id === 'undo' || id === 'redo') this.toast.show(`Nothing to ${id}`);
    else this.toast.show('Select a block first');
  }

  // ------------------------------------------------------------------ selection and picker
  select(c: { x: number; y: number } | null) {
    this.selected = c;
    this.refresh();
  }

  openPicker(target: { x: number; y: number }) {
    this.viewBeforePicker = { ...this.view };
    const visible = { x: 0, y: LAYOUT.gridArea.y, w: VIEW_W, h: LAYOUT.sheet.y - 34 - LAYOUT.gridArea.y };
    this.view = panToReveal(this.view, target.x, target.y, visible);
    this.gridR.setView(this.view);
    this.dim.visible = true;
    this.stats.moveTo(LAYOUT.sheet.y - LAYOUT.stats.h);
    this.picker.open(this.model, target, {
      onHighlight: (id) => this.highlightTile(id),
      onPlace: (id) => this.placeFromPicker(id),
      onClose: () => this.closePicker(),
      onMessage: (m) => this.toast.show(m),
    });
    this.refresh();
  }

  closePicker() {
    this.picker.close();
    this.preview = null;
    this.dim.visible = false;
    this.stats.moveTo(LAYOUT.stats.y);
    if (this.viewBeforePicker) { this.view = this.viewBeforePicker; this.viewBeforePicker = null; this.applyView(); }
    this.refresh();
  }

  private highlightTile(id: string) {
    const t = this.picker.target!;
    this.picker.highlight(id);
    const blockId = id === REMOVE_TILE ? null : id;
    const p = this.model.previewPlace(t.x, t.y, blockId);
    if (p) this.preview = { x: t.x, y: t.y, blockId, ...p };
    this.refresh();
    if (blockId) {
      const def = BLOCKS[blockId];
      const ok = p && p.compiled.recipes.length > 0;
      this.inspector.set(ok ? def.name : `${def.name} · no ejector reached`, describeBlock(def, 1), ok ? 0xffffff : COLORS.warn);
    } else {
      this.inspector.set('Remove', 'Clears this cell and returns the block to your inventory.');
    }
  }

  private placeFromPicker(id: string) {
    const t = this.picker.target!;
    const res = id === REMOVE_TILE ? this.model.remove(t.x, t.y) : this.model.place(t.x, t.y, id);
    this.closePicker();
    if (!res.ok) this.toast.show(res.error);
    else this.select(t);
  }

  private openStatsPanel() {
    const s = this.model.compiled.stats;
    this.info.show(
      'Circuit stats',
      `Dmg/shot: damage of one projectile after every block on its line.\n` +
      `Proj/pulse: projectiles the ship fires each pulse, one per ejector the line reaches.\n` +
      `Pulses/s: how many pulses the generator fires each second (${s.pulsesPerSecond}).\n` +
      `Est. DPS: expected damage per second, counting chance blocks at their average.`,
      s.warnings,
    );
  }

  // ------------------------------------------------------------------ ledger tooltip
  private cellUnder(x: number, y: number): { x: number; y: number } | null {
    if (this.picker.isOpen || this.info.isOpen || this.hullPanel.visible) return null;
    if (!inRect(LAYOUT.gridArea, x, y) || this.buttonAt(x, y)) return null;
    return cellFromPoint(this.view, this.model.grid.w, this.model.grid.h, x, y);
  }

  private handleHover(x: number, y: number) {
    const c = this.cellUnder(x, y);
    if (!c) { this.hover = null; this.hideTip(); return; }
    if (!this.hover || this.hover.x !== c.x || this.hover.y !== c.y) {
      this.hideTip();
      this.hover = { x: c.x, y: c.y, since: performance.now() };
    }
  }

  private handleLongPress(x: number, y: number) {
    const c = this.cellUnder(x, y);
    if (c) this.showLedger(c.x, c.y);
  }

  /** Text of the packet after a cell, or null if no signal passes it. */
  ledgerText(cx: number, cy: number): string | null {
    const info = this.model.compiled.cellInfo[cy * this.model.grid.w + cx];
    const l = info?.ledger;
    if (!info?.onPath || !l) return null;
    const dmg = Math.abs(l.expectedDamage - l.damage) > 0.005
      ? `Damage ${fmtNum(l.damage)} (average ${fmtNum(l.expectedDamage)} with chance blocks)`
      : `Damage ${fmtNum(l.damage)}`;
    const mods = l.mods.length ? l.mods.map(m => MOD_LABEL[m] ?? m).join(', ') : 'none';
    return `After this cell\n${dmg}\nPure ${Math.round(l.pure * 100)}% · Projectiles ${l.count}\nModifiers: ${mods}`;
  }

  private showLedger(cx: number, cy: number) {
    const text = this.ledgerText(cx, cy);
    if (!text) return;
    this.tipText.text = text;
    const w = Math.min(VIEW_W - 8, this.tipText.width + 20);
    const h = this.tipText.height + 14;
    const centre = cellCenterOf(this.view, cx, cy);
    const x = Math.max(4, Math.min(VIEW_W - 4 - w, centre.x - w / 2));
    let y = centre.y - this.view.scale / 2 - h - 6;
    if (y < LAYOUT.gridArea.y) y = centre.y + this.view.scale / 2 + 6;
    this.tipBg.clear().roundRect(x, y, w, h, 8).fill({ color: 0x101010, alpha: 0.95 }).stroke({ color: COLORS.red, width: 1.5 });
    this.tipText.position.set(x + 10, y + 7);
    this.tip.visible = true;
  }

  private hideTip() {
    this.tip.visible = false;
  }

  // ------------------------------------------------------------------ hull panel
  private openHullPanel() {
    for (const ch of this.hullPanel.removeChildren()) ch.destroy({ children: true });
    this.hullRows = [];
    const dim = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0x000000, alpha: 0.6 });
    const panel = new Graphics().roundRect(16, 150, VIEW_W - 32, 90 + HULL_INFO.length * 84, 14).fill(0x2a2a2a).stroke({ color: COLORS.red, width: 2 });
    const title = makeText('Choose a hull', 20, 0xffffff, { fontWeight: 'bold' });
    title.position.set(32, 164);
    this.hullPanel.addChild(dim, panel, title);
    HULL_INFO.forEach((h, i) => {
      const rect: Rect = { x: 28, y: 204 + i * 84, w: VIEW_W - 56, h: 72 };
      const active = h.id === this.model.hullId;
      const row = new Graphics().roundRect(rect.x, rect.y, rect.w, rect.h, 10).fill(active ? 0x4b5a4b : 0x3d3d3d).stroke({ color: active ? COLORS.green : 0x777777, width: active ? 3 : 1.5 });
      const name = makeText(active ? `${h.name} (current)` : h.name, 20, 0xffffff, { fontWeight: 'bold' });
      name.position.set(rect.x + 14, rect.y + 10);
      const desc = makeText(h.desc, 14, 0xd0d0d0, { wordWrap: true, wordWrapWidth: rect.w - 28 });
      desc.position.set(rect.x + 14, rect.y + 38);
      this.hullPanel.addChild(row, name, desc);
      this.hullRows.push({ id: h.id, rect });
    });
    this.hullPanel.visible = true;
  }

  private tapHullPanel(x: number, y: number) {
    const row = this.hullRows.find(r => inRect(r.rect, x, y));
    this.hullPanel.visible = false;
    if (!row || row.id === this.model.hullId) return;
    const res = this.model.switchHull(row.id);
    if (!res.ok) { this.toast.show(res.error); return; }
    this.selected = null;
    this.fit();
    this.refresh();
    this.toast.show(`Hull: ${HULL_INFO.find(h => h.id === row.id)?.name ?? row.id}`, 1400);
  }

  // ------------------------------------------------------------------ actions
  private report(res: { ok: boolean; error?: string }) {
    if (!res.ok && res.error) this.toast.show(res.error);
  }

  private clearCell() {
    if (this.selected) this.report(this.model.remove(this.selected.x, this.selected.y) as any);
  }

  private rotate(steps: 1 | -1) {
    if (this.selected) this.report(this.model.rotate(this.selected.x, this.selected.y, steps) as any);
  }

  private autoOrient() {
    if (this.selected) this.report(this.model.autoOrient(this.selected.x, this.selected.y) as any);
  }

  private clearAll() {
    this.report(this.model.clearAll() as any);
  }

  private undo() { this.model.undo(); }
  private redo() { this.model.redo(); }

  private toggleSlot() {
    this.model.switchSlot(this.model.active === 'A' ? 'B' : 'A');
    this.selected = null;
    this.refresh();
    this.toast.show(`Circuit ${this.model.active}`, 1200);
  }

  private async copyLayout() {
    try {
      await navigator.clipboard.writeText(this.model.copyLayout());
      this.toast.show('Layout copied');
    } catch {
      this.toast.show("Couldn't copy: clipboard unavailable");
    }
  }

  private async pasteLayout() {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      this.toast.show("Couldn't paste: clipboard unavailable");
      return;
    }
    const res = this.model.pasteLayout(text);
    if (res.ok) this.toast.show('Layout pasted');
    else this.toast.show(res.error);
  }

  fly() {
    if (this.model.compiled.recipes.length === 0) {
      this.toast.show("Your circuit doesn't reach an ejector");
      return;
    }
    this.sm.switchTo(new FlyScreen(this.sm, this.model.gridForFlight(), () => this.sm.switchTo(new BuildScreen(this.sm))));
  }
}
