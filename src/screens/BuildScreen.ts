import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '../config';
import { Screen, ScreenManager } from './ScreenManager';
import { FlyScreen } from './FlyScreen';
import { MapScreen } from './MapScreen';
import { clientToGame } from '../input';
import { BLOCKS, MOD_LABEL } from '../data/blocks';
import { HULL_INFO } from '../game/gridUtils';
import { HullPicker } from '../builder/hullPicker';
import { buyAndSelectHull } from '../builder/hullPickerLogic';
import { describeBlock } from '../engine/compilerTypes';
import { blockText } from '../data/blockText';
import { CompiledShip, Grid } from '../engine/compiler';
import { BuilderModel, statsDelta } from '../builder/model';
import { getBuilderModel } from '../builder/session';
import { GestureTracker } from '../builder/gestures';
import { GridRenderer } from '../builder/gridView';
import {
  cellFromPoint, clampView, fitView, inRect, LAYOUT, MIN_TAP, panBy, panToReveal, View, VIEW_H, VIEW_W, zoomAt,
} from '../builder/layout';
import {
  COLORS, drawToolIcon, ToolIcon,
} from '../builder/draw';
import { InfoPanel, Inspector, makeText, StatsStrip, Toast, UIButton } from '../builder/ui';
import { Picker, REMOVE_TILE } from '../builder/picker';
import { BUILD_KEY_HELP, BuildKeyAction, keyAction } from '../builder/keys';
import { THEME } from '../ui/theme';
import { CreditsBadge } from '../ui/hud';
import { makeTabButtons } from '../builder/tabs';
import { ShopScreen } from './ShopScreen';
import { CaptainScreen } from './CaptainScreen';
import { sfx } from '../audio';
import { fmtDamage } from '../ui/format';

const HOVER_MS = 800;

function fmtNum(n: number): string {
  if (!(Math.abs(n) < 1000)) return fmtDamage(n);
  return Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(1);
}

function cellCenterOf(v: View, cx: number, cy: number) {
  return { x: v.ox + (cx + 0.5) * v.scale, y: v.oy + (cy + 0.5) * v.scale };
}

const HELP_TEXT =
  'Tap a cell to select and inspect it; tap it again to open the block picker. Tap a tile to preview it, tap it again to place it.\n\n' +
  'The red line is automatic: it leaves the generator and runs straight until a block changes it, ending at an ejector. ' +
  'A block you place turns to face the line that reaches it, once, and keeps that facing. Rotate turns the selected block; Auto-orient turns just that block to face the line again.\n\n' +
  'Drag to pan, pinch or use the wheel to zoom, and use the corner-arrows button to fit the hull.' +
  '\n\nKeyboard:\n' + BUILD_KEY_HELP.join('\n');

/**
 * The circuit builder. All state lives in BuilderModel; this screen only renders it and turns
 * pointer gestures into model edits.
 */
export class BuildScreen implements Screen {
  statsName = 'Build';
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
  private tipText = makeText('', 13, THEME.text, { lineHeight: 17 });
  private hover: { x: number; y: number; since: number } | null = null;
  readonly hullPicker: HullPicker;

  constructor(private sm: ScreenManager) {
    this.model = getBuilderModel();
    this.hullPicker = new HullPicker(this.sm.app.renderer, {
      choose: (id) => this.chooseHull(id),
      buy: (id) => this.buyHull(id),
      state: () => ({ ownedHulls: this.model.store.data.ownedHulls, current: this.model.hullId, credits: this.model.store.data.credits }),
    });
    this.view = fitView(this.model.grid.w, this.model.grid.h);

    const bg = new Graphics().rect(0, 0, VIEW_W, VIEW_H).fill(COLORS.bg);
    this.container.addChild(bg, this.gridR.container);
    this.buildHud();
    this.dim.rect(0, LAYOUT.gridArea.y, VIEW_W, LAYOUT.sheet.y - LAYOUT.gridArea.y).fill({ color: THEME.dim, alpha: 0.28 });
    this.dim.visible = false;
    this.tip.visible = false;
    this.tip.addChild(this.tipBg, this.tipText);
    this.container.addChild(this.dim, this.picker.container, this.stats.container, this.tip, this.hullPicker.container, this.info.container, this.toast.container);

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
        // While the settings panel is open (or was closed by this very tap) the builder underneath ignores the pointer.
        onTap: (x, y) => { if (!this.sm.overlays?.blocking) this.handleTap(x, y); },
        onDrag: (dx, dy) => { if (!this.sm.overlays?.blocking) this.handleDrag(dx, dy); },
        onPinch: (f, cx, cy) => { if (!this.sm.overlays?.blocking) this.zoom(f, cx, cy); },
        onWheel: (dy, x, y) => { if (!this.sm.overlays?.blocking) this.handleWheel(dy, x, y); },
        canDrag: (x, y) => !this.sm.overlays?.blocking && this.canDrag(x, y),
        onMove: (x, y) => { if (!this.sm.overlays?.blocking) this.handleHover(x, y); },
        onLongPress: (x, y) => { if (!this.sm.overlays?.blocking) this.handleLongPress(x, y); },
        onLongPressEnd: () => this.hideTip(),
      },
    );
    this.gestures.attach();
    const offModel = this.model.onChange(() => this.refresh());
    const offStore = this.model.store.onChange(() => this.credits.set(this.model.store.data.credits));
    // Keyboard shortcuts (chunk 21a, builder/keys.ts); a sheet or the help panel being open lets only Escape through.
    const onKey = (e: KeyboardEvent) => {
      const a = keyAction({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey, repeat: e.repeat, target: e.target as HTMLElement | null });
      if (!a) return;
      if (this.keyAction(a)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    this.unsubscribe = () => { offModel(); offStore(); window.removeEventListener('keydown', onKey); };
    // One-time messages: the economy refund of a migrated save, and blocks taken off a circuit that used more than is owned.
    const note = this.model.store.takeNotice();
    if (this.model.trimmed > 0) {
      const n = this.model.trimmed;
      const trimmed = `${n} block${n === 1 ? '' : 's'} returned: you own fewer than the circuit used`;
      this.toast.show(note ? `${note} ${trimmed}.` : trimmed, note ? 7000 : 3500);
    } else if (note) this.toast.show(note, 6000);
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

  /** Flat rectangular button face: fill, outline and icon follow the enabled / selected state. */
  private flatFace(g: Graphics, b: UIButton, icon: ToolIcon, size = Math.min(b.rect.w, b.rect.h) * 0.55, iconY = b.rect.h / 2) {
    const { w, h } = b.rect;
    const lit = b.lit;
    const off = !b.enabled;
    g.rect(1, 1, w - 2, h - 2).fill(lit ? THEME.pressedFill : THEME.buttonFill).stroke({ color: off ? THEME.disabled : THEME.buttonLine, width: 1.5 });
    const ic = new Graphics();
    drawToolIcon(ic, icon, size, off ? THEME.disabled : lit ? THEME.pressedIcon : THEME.buttonIcon);
    ic.position.set(w / 2, iconY);
    g.addChild(ic);
  }

  private buildHud() {
    const top = LAYOUT.top;
    const hud = new Graphics()
      .rect(top.x, top.y, top.w, top.h).fill(THEME.panel).rect(0, top.h - 1, VIEW_W, 1).fill(THEME.border)
      .rect(LAYOUT.toolbar.x, LAYOUT.toolbar.y, LAYOUT.toolbar.w, LAYOUT.toolbar.h).fill(THEME.panel)
      .rect(LAYOUT.toolbar.x, LAYOUT.toolbar.y, LAYOUT.toolbar.w, 1).fill(THEME.border)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, LAYOUT.tabs.h).fill(THEME.panel)
      .rect(LAYOUT.tabs.x, LAYOUT.tabs.y, LAYOUT.tabs.w, 1).fill(THEME.border);
    this.container.addChild(hud, this.inspector.container);

    const mode = makeText('Select', 32, THEME.text, { fontWeight: 'bold' });
    mode.anchor.set(0.5);
    mode.position.set(VIEW_W / 2, 27);
    this.credits = new CreditsBadge();
    this.credits.set(this.model.store.data.credits);
    this.container.addChild(mode, this.credits.container);

    // Top bar buttons.
    this.addButton(new UIButton({
      id: 'ship', rect: { x: 6, y: 4, w: 44, h: 44 }, onTap: () => this.hullPicker.open(),
      draw: (g, b) => this.flatFace(g, b, 'ship', 30),
    }));
    this.addButton(new UIButton({
      id: 'help', rect: { x: 56, y: 4, w: 44, h: 44 }, onTap: () => this.info.show('How the builder works', HELP_TEXT),
      draw: (g, b) => this.flatFace(g, b, 'help', 28),
    }));

    this.addButton(new UIButton({
      id: 'settings', rect: { x: 106, y: 4, w: 44, h: 44 }, onTap: () => this.sm.overlays?.openSettings(false),
      draw: (g, bb) => {
        g.rect(1, 1, bb.rect.w - 2, bb.rect.h - 2).fill(bb.lit ? THEME.pressedFill : THEME.buttonFill).stroke({ color: THEME.buttonLine, width: 1.5 });
        // A gear: a ring with eight teeth.
        const c = bb.lit ? THEME.pressedIcon : THEME.buttonIcon;
        const gear = new Graphics();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          gear.moveTo(Math.cos(a) * 7, Math.sin(a) * 7).lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
        }
        gear.stroke({ color: c, width: 4 });
        gear.circle(0, 0, 8).stroke({ color: c, width: 3 });
        gear.position.set(bb.rect.w / 2, bb.rect.h / 2);
        g.addChild(gear);
      },
    }));

    // Grid corner buttons.
    const row = (i: number, fromRight = false) => ({
      x: fromRight ? VIEW_W - 6 - 44 - i * 48 : 6 + i * 48, y: LAYOUT.gridArea.y + 6, w: MIN_TAP, h: MIN_TAP,
    });
    this.addButton(new UIButton({ id: 'fit', rect: row(0), onTap: () => this.fit(), draw: (g, b) => this.flatFace(g, b, 'fit') }));
    this.undoButton = this.addButton(new UIButton({ id: 'undo', rect: row(1), onTap: () => this.undo(), draw: (g, b) => this.flatFace(g, b, 'undo') }));
    this.redoButton = this.addButton(new UIButton({ id: 'redo', rect: row(2), onTap: () => this.redo(), draw: (g, b) => this.flatFace(g, b, 'redo') }));
    this.abButton = this.addButton(new UIButton({
      id: 'ab', rect: row(0, true), onTap: () => this.toggleSlot(),
      draw: (g, b) => {
        const { w, h } = b.rect;
        g.rect(1, 1, w - 2, h - 2).fill(b.lit ? THEME.pressedFill : THEME.buttonFill).stroke({ color: THEME.buttonLine, width: 1.5 });
        if (this.abLabel) this.abLabel.style.fill = b.lit ? THEME.pressedIcon : THEME.text;
      },
    }));
    this.abLabel = makeText('A', 28, THEME.text, { fontWeight: 'bold' });
    this.abLabel.anchor.set(0.5);
    this.abLabel.position.set(22, 22);
    this.abButton.container.addChild(this.abLabel);
    this.addButton(new UIButton({ id: 'paste', rect: row(1, true), onTap: () => void this.pasteLayout(), draw: (g, b) => this.flatFace(g, b, 'paste') }));
    this.addButton(new UIButton({ id: 'copy', rect: row(2, true), onTap: () => void this.copyLayout(), draw: (g, b) => this.flatFace(g, b, 'copy') }));

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
        id: d.id, rect: { x: i * 108, y: LAYOUT.toolbar.y + 2, w: 108, h: LAYOUT.toolbar.h - 2 }, label: d.label, labelSize: 11, labelColor: THEME.text,
        onTap: d.act,
        draw: (g, bb) => this.flatFace(g, bb, d.icon, 26, 18),
      });
      this.toolbar[d.id] = this.addButton(b);
    });

    // FLY pill.
    const fly = new UIButton({
      id: 'fly', rect: { x: VIEW_W - 134, y: LAYOUT.gridArea.y + LAYOUT.gridArea.h - 54, w: 124, h: 46 }, onTap: () => this.fly(),
      draw: (g, b) => {
        g.rect(0, 0, b.rect.w, b.rect.h).fill(b.lit ? THEME.buttonFill : THEME.pressedFill);
        g.poly([86, 12, 86, 34, 104, 23]).fill(b.lit ? THEME.buttonIcon : THEME.pressedIcon);
        if (this.flyLabel) this.flyLabel.style.fill = b.lit ? THEME.buttonIcon : THEME.pressedIcon;
      },
    });
    const flyLabel = makeText('FLY', 24, THEME.pressedIcon, { fontWeight: 'bold' });
    this.flyLabel = flyLabel;
    flyLabel.anchor.set(0.5);
    flyLabel.position.set(46, 23);
    fly.container.addChild(flyLabel);
    this.addButton(fly);

    // CAMPAIGN pill above FLY: the tier map. FLY stays Free Fly.
    const campaign = new UIButton({
      id: 'campaign', rect: { x: VIEW_W - 134, y: LAYOUT.gridArea.y + LAYOUT.gridArea.h - 108, w: 124, h: 46 }, onTap: () => this.sm.switchTo(new MapScreen(this.sm)),
      draw: (g, b) => {
        g.rect(1, 1, b.rect.w - 2, b.rect.h - 2).fill(b.lit ? THEME.pressedFill : THEME.buttonFill).stroke({ color: THEME.buttonLine, width: 1.5 });
        if (this.campaignLabel) this.campaignLabel.style.fill = b.lit ? THEME.pressedIcon : THEME.text;
      },
    });
    const campaignLabel = makeText('CAMPAIGN', 17, THEME.text, { fontWeight: 'bold' });
    this.campaignLabel = campaignLabel;
    campaignLabel.anchor.set(0.5);
    campaignLabel.position.set(62, 23);
    campaign.container.addChild(campaignLabel);
    this.addButton(campaign);

    // Tab bar.
    for (const b of makeTabButtons('tabBuild', (id) => this.tapTab(id))) this.addButton(b);
  }

  private credits!: CreditsBadge;
  private abLabel!: ReturnType<typeof makeText>;
  private flyLabel: ReturnType<typeof makeText> | null = null;
  private campaignLabel: ReturnType<typeof makeText> | null = null;

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
      this.inspector.set('Circuit builder', 'Tap a cell to inspect it; tap it again to build. The red line runs from the generator to an ejector.');
      return;
    }
    const cell = this.model.cellAt(sel.x, sel.y);
    if (!cell) return;
    switch (cell.type) {
      case 'void':
        return;
      case 'generator':
        this.inspector.set('Generator', describeBlock(BLOCKS.generator));
        return;
      case 'ejector':
        this.inspector.set('Ejector', describeBlock(BLOCKS.ejector));
        return;
    }
    if (!cell.blockId) {
      this.inspector.set('Empty cell', 'Buildable. The red line passes straight through. Tap it again to build here.');
      return;
    }
    const def = BLOCKS[cell.blockId];
    const info = this.model.compiled.cellInfo[sel.y * this.model.grid.w + sel.x];
    const text = blockText(def, cell.level);
    const second = info.onPath ? text.stack ?? '' : [text.stack, 'No signal reaches it.'].filter(Boolean).join(' · ');
    this.inspector.set(def.name, text.short, THEME.text, second);
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
        inspector: { title: this.inspector.titleText, body: this.inspector.bodyText, stack: this.inspector.stackText },
        statsStrip: this.stats.texts(),
        ledger: this.tip.visible ? this.tipText.text : null,
        hull: this.model.hullId,
        hullPanelOpen: this.hullPicker.isOpen,
        credits: this.model.store.data.credits,
        creditsText: this.credits.text,
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
    if (this.info.isOpen) return false;
    if (this.hullPicker.isOpen) return this.hullPicker.inList(x, y);
    if (this.picker.isOpen) return this.picker.inList(x, y);
    return inRect(LAYOUT.gridArea, x, y) && !this.buttonAt(x, y);
  }

  private handleDrag(dx: number, dy: number) {
    this.hideTip();
    this.hover = null;
    if (this.hullPicker.isOpen) { this.hullPicker.scrollBy(-dy); return; }
    if (this.picker.isOpen) { this.picker.scrollBy(-dy); return; }
    this.view = panBy(this.view, dx, dy);
    this.applyView();
  }

  private handleWheel(deltaY: number, x: number, y: number) {
    if (this.info.isOpen) return;
    if (this.hullPicker.isOpen) { if (this.hullPicker.inList(x, y)) this.hullPicker.scrollBy(deltaY); return; }
    if (this.picker.isOpen) { if (this.picker.inList(x, y)) this.picker.wheel(deltaY); return; }
    if (inRect(LAYOUT.gridArea, x, y)) this.zoom(Math.exp(-deltaY * 0.0015), x, y);
  }

  handleTap(x: number, y: number) {
    this.hideTip();
    if (this.hullPicker.isOpen) { this.hullPicker.tap(x, y); return; }
    if (this.info.isOpen) { this.info.hide(); return; }
    if (this.picker.isOpen) {
      if (this.picker.tap(x, y)) return;
      this.closePicker();
      return;
    }
    const b = this.buttonAt(x, y);
    if (b) {
      if (b.enabled) { b.flash(); b.spec.onTap(); }
      else this.disabledHint(b.id);
      return;
    }
    if (this.stats.hit(x, y)) { this.openStatsPanel(); return; }
    if (inRect(LAYOUT.gridArea, x, y)) {
      const c = cellFromPoint(this.view, this.model.grid.w, this.model.grid.h, x, y);
      this.tapCell(c);
    }
  }

  /** Void cells are not selectable (tapping one deselects). Tapping the selected buildable cell opens the picker. */
  private tapCell(c: { x: number; y: number } | null) {
    const type = c ? this.model.cellAt(c.x, c.y)?.type : undefined;
    if (!c || type === undefined || type === 'void') { this.select(null); return; }
    const again = !!this.selected && this.selected.x === c.x && this.selected.y === c.y;
    if (again && type === 'empty') { this.openPicker(c); return; }
    this.select(c);
  }

  private tapTab(id: string) {
    if (id === 'tabBuild') return;
    if (id === 'tabShop') { this.sm.switchTo(new ShopScreen(this.sm)); return; }
    if (id === 'tabMap') { this.sm.switchTo(new MapScreen(this.sm)); return; }
    if (id === 'tabCaptain') { this.sm.switchTo(new CaptainScreen(this.sm)); return; }
    this.toast.show('Coming soon');
  }

  private disabledHint(id: string) {
    sfx.play('denied');
    if (id === 'undo' || id === 'redo') this.toast.show(`Nothing to ${id}`);
    else this.toast.show('Select a block first');
  }

  // ------------------------------------------------------------------ selection and picker
  select(c: { x: number; y: number } | null) {
    this.selected = c;
    this.refresh();
  }

  openPicker(target: { x: number; y: number }) {
    sfx.play('pickerOpen');
    this.viewBeforePicker = { ...this.view };
    const visible = { x: 0, y: LAYOUT.gridArea.y, w: VIEW_W, h: LAYOUT.sheet.y - 34 - LAYOUT.gridArea.y };
    this.view = panToReveal(this.view, target.x, target.y, visible);
    this.gridR.setView(this.view);
    this.dim.visible = true;
    this.stats.moveTo(LAYOUT.sheet.y - LAYOUT.stats.h);
    this.picker.open(this.model, target, {
      onHighlight: (id) => this.highlightTile(id),
      onPlace: (id) => this.placeFromPicker(id),
      onMessage: (m) => this.toast.show(m),
    });
    this.refresh();
  }

  closePicker() {
    if (this.picker.isOpen) sfx.play('pickerClose');
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
      const text = blockText(def, this.model.levelOf(blockId));
      this.inspector.set(ok ? def.name : `${def.name} · no ejector reached`, text.short, ok ? THEME.text : THEME.warn, text.stack ?? '');
    } else {
      this.inspector.set('Remove', 'Clears this cell and returns the block to your inventory.');
    }
  }

  private placeFromPicker(id: string) {
    const t = this.picker.target!;
    if (id === this.model.cellAt(t.x, t.y)?.blockId) { this.closePicker(); return; }
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
    );
  }

  // ------------------------------------------------------------------ ledger tooltip
  private cellUnder(x: number, y: number): { x: number; y: number } | null {
    if (this.picker.isOpen || this.info.isOpen || this.hullPicker.isOpen) return null;
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
    this.tipBg.clear().rect(x, y, w, h).fill(THEME.panel).stroke({ color: THEME.border, width: 1.5 });
    this.tipText.position.set(x + 10, y + 7);
    this.tip.visible = true;
  }

  private hideTip() {
    this.tip.visible = false;
  }

  // ------------------------------------------------------------------ hull picker
  /** An owned hull was tapped in the picker (or one was just bought): the builder switches to it. */
  private chooseHull(id: string) {
    this.hullPicker.close();
    if (id === this.model.hullId) return;
    const res = this.model.switchHull(id);
    if (!res.ok) { this.toast.show(res.error ?? 'Cannot switch hull'); return; }
    this.selected = null;
    this.fit();
    this.refresh();
    const hullName = HULL_INFO.find(h => h.id === id)?.name ?? id;
    if (this.model.trimmed > 0) {
      const n = this.model.trimmed;
      this.model.trimmed = 0;
      this.toast.show(`Hull: ${hullName}. ${n} block${n === 1 ? '' : 's'} returned: you own fewer than the circuit used`, 3500);
    } else this.toast.show(`Hull: ${hullName}`, 1400);
  }

  /** The Buy button of an unowned hull's info sheet: pay, then switch to it. */
  private buyHull(id: string) {
    const before = this.model.store.data.credits;
    const hullName = HULL_INFO.find(h => h.id === id)?.name ?? id;
    const res = buyAndSelectHull({ store: this.model.store, model: this.model }, id);
    sfx.play(this.model.store.data.credits < before ? 'purchase' : 'denied');
    if (!res.ok) { this.toast.show(res.error ?? 'Cannot buy'); this.hullPicker.refresh(); return; }
    this.hullPicker.close();
    this.selected = null;
    this.fit();
    this.refresh();
    this.toast.show(`Bought the ${hullName}`, 1800);
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

  /** Carries out a keyboard action; true when it did something (the key press is then consumed). */
  keyAction(a: BuildKeyAction): boolean {
    if (a === 'escape') {
      if (this.hullPicker.isOpen) { this.hullPicker.close(); return true; }
      if (this.info.isOpen) { this.info.hide(); return true; }
      if (this.picker.isOpen) { this.closePicker(); return true; }
      if (this.selected) { this.selected = null; this.refresh(); return true; }
      return false;
    }
    if (this.picker.isOpen || this.info.isOpen || this.hullPicker.isOpen) return false; // the sheet is up: touch rules apply
    switch (a) {
      case 'rotateRight': if (!this.selectedBlockCell()) return false; this.rotate(1); return true;
      case 'rotateLeft': if (!this.selectedBlockCell()) return false; this.rotate(-1); return true;
      case 'delete': if (!this.selectedBlockCell()) return false; this.clearCell(); return true;
      case 'autoOrient': if (!this.selectedBlockCell()) return false; this.autoOrient(); return true;
      case 'undo': this.undo(); return true;
      case 'redo': this.redo(); return true;
      case 'fly': this.fly(); return true;
    }
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
    this.sm.switchTo(new FlyScreen(this.sm, this.model.gridForFlight()));
  }
}
