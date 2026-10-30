import { Container, Graphics, Text } from 'pixi.js';
import { CONFIG } from '../config';
import { makeText } from '../builder/ui';
import { sfx } from '../audio';
import { THEME } from './theme';
import { WEAPON_SOUNDS } from './settings';
import type { ScreenManager } from '../screens/ScreenManager';
import { PROGRESS_KEY } from '../econ/progress';
import { LEGACY_KEY, STORAGE_KEY } from '../builder/persist';
import { VERSION_LABEL } from '../version';
import { openExportSave, openImportSave } from './saveTransferUi';

const W = CONFIG.VIEW.W;
const H = CONFIG.VIEW.H;
/** The pause button in the top-right corner of the fly screens. */
const PAUSE_BTN = { x: W - 46, y: 8, w: 38, h: 38 };
/** Volume buttons move the volume this much per tap. */
const VOLUME_STEP = 0.1;
/** Taps this soon after the panel was closed are still treated as part of the closing tap (the screen below ignores them). */
const CLOSE_GUARD_MS = 150;

type View = 'none' | 'pause' | 'settings' | 'confirm';
interface Btn { id: string; x: number; y: number; w: number; h: number; label: string; act: () => void; node: Container; text: Text; face: Graphics }

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * The overlays above every screen: the pause button, the pause menu and the settings panel. They are drawn on one container
 * added on top of the stage and take taps by game coordinates (InputManager.onTap), like the builder's own panels.
 */
export class Overlays {
  readonly container = new Container();
  private view: View = 'none';
  /** Where "Back" in the settings goes: the pause menu (opened from there) or nothing (opened from the Build screen). */
  private settingsFromPause = false;
  private closedAt = -1e9;
  private openedAt = -1e9;
  private pauseBtn = new Container();
  private pauseBtnFace = new Graphics();
  private dim = new Graphics();
  private panel = new Container();
  private buttons: Btn[] = [];
  private readonly valueTexts = new Map<string, Text>();

  constructor(private sm: ScreenManager, private now: () => number = () => performance.now()) {
    this.dim.rect(0, 0, W, H).fill({ color: THEME.dim, alpha: 0.6 });
    this.dim.visible = false;
    this.pauseBtnFace.rect(0, 0, PAUSE_BTN.w, PAUSE_BTN.h).fill({ color: THEME.panel, alpha: 0.85 }).stroke({ color: THEME.buttonLine, width: 1.5 });
    this.pauseBtnFace.rect(11, 10, 6, 18).fill(THEME.buttonIcon).rect(21, 10, 6, 18).fill(THEME.buttonIcon);
    this.pauseBtn.addChild(this.pauseBtnFace);
    this.pauseBtn.position.set(PAUSE_BTN.x, PAUSE_BTN.y);
    this.pauseBtn.visible = false;
    this.container.addChild(this.pauseBtn, this.dim, this.panel);
  }

  /** Which panel is showing: 'none' | 'pause' | 'settings' | 'confirm' (for tests and the e2e hook). */
  get current(): View { return this.view; }

  /** Centre of a panel button in game coordinates (for the e2e test). */
  buttonCenter(id: string): { x: number; y: number } | null {
    const b = this.buttons.find(bb => bb.id === id);
    return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
  }

  /** True while the screen underneath must ignore taps and drags (a panel is open, or just closed with this tap). */
  get blocking(): boolean { return this.view !== 'none' || this.now() - this.closedAt < CLOSE_GUARD_MS; }

  /** Per-frame sync: the pause button follows whether the current screen can be paused right now. */
  update() {
    const can = this.view === 'none' && !this.sm.paused && !!this.sm.currentScreen?.pausable?.canPause();
    if (this.pauseBtn.visible !== can) this.pauseBtn.visible = can;
    // The pause menu is open exactly while the manager is paused (Escape, blur or the button all go through the manager).
    if (this.sm.paused && this.view === 'none') this.show('pause');
    else if (!this.sm.paused && this.view === 'pause') this.hide();
  }

  // ------------------------------------------------------------------ opening and closing
  openSettings(fromPause = false) {
    this.settingsFromPause = fromPause;
    this.show('settings');
  }

  /** Escape: back out of the settings, or toggle the pause menu. Returns whether it did something. */
  escape(): boolean {
    if (this.view === 'confirm') { this.show('settings'); return true; }
    if (this.view === 'settings') { this.closeSettings(); return true; }
    return false;
  }

  private closeSettings() {
    if (this.settingsFromPause && this.sm.paused) this.show('pause');
    else this.hide();
  }

  private hide() {
    if (this.view !== 'none') this.closedAt = this.now();
    this.view = 'none';
    this.dim.visible = false;
    this.clearPanel();
  }

  private clearPanel() {
    for (const c of this.panel.removeChildren()) c.destroy({ children: true });
    this.buttons = [];
    this.valueTexts.clear();
  }

  private show(v: View) {
    this.view = v;
    this.openedAt = this.now();
    this.dim.visible = true;
    this.clearPanel();
    if (v === 'pause') this.buildPause();
    else if (v === 'settings') this.buildSettings();
    else if (v === 'confirm') this.buildConfirm();
  }

  // ------------------------------------------------------------------ taps
  /** Returns true when the tap was taken (a panel is open, or it hit the pause button). */
  tap(x: number, y: number): boolean {
    if (this.view === 'none') {
      if (!this.pauseBtn.visible) return false;
      if (x >= PAUSE_BTN.x && x <= PAUSE_BTN.x + PAUSE_BTN.w && y >= PAUSE_BTN.y && y <= PAUSE_BTN.y + PAUSE_BTN.h) {
        sfx.play('uiTap');
        this.sm.pause();
        return true;
      }
      return false;
    }
    if (this.now() - this.openedAt < 60) return true; // the tap that opened the panel
    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        sfx.play('uiTap');
        b.act();
        return true;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------ building the panels
  private panelBox(w: number, h: number, title: string): { x: number; y: number } {
    const x = (W - w) / 2;
    const y = (H - h) / 2;
    const g = new Graphics().rect(x, y, w, h).fill(THEME.panel).stroke({ color: THEME.border, width: 2 });
    const t = makeText(title, 26, THEME.text, { fontWeight: 'bold' });
    t.anchor.set(0.5, 0);
    t.position.set(W / 2, y + 16);
    this.panel.addChild(g, t);
    return { x, y };
  }

  private addButton(id: string, x: number, y: number, w: number, h: number, label: string, act: () => void, size = 20): Btn {
    const node = new Container();
    const face = new Graphics();
    const text = makeText(label, size, THEME.text, { fontWeight: 'bold' });
    text.anchor.set(0.5);
    text.position.set(x + w / 2, y + h / 2);
    this.drawFace(face, x, y, w, h, false);
    node.addChild(face, text);
    this.panel.addChild(node);
    const b: Btn = { id, x, y, w, h, label, act, node, text, face };
    this.buttons.push(b);
    return b;
  }

  private drawFace(g: Graphics, x: number, y: number, w: number, h: number, lit: boolean) {
    g.clear().rect(x, y, w, h).fill(lit ? THEME.pressedFill : THEME.buttonFill).stroke({ color: THEME.buttonLine, width: 1.5 });
  }

  private buildPause() {
    const bw = 280, bh = 56, gap = 14;
    const { y } = this.panelBox(340, 70 + 4 * (bh + gap) + 8, 'PAUSED');
    let by = y + 66;
    const x = (W - bw) / 2;
    const row = (id: string, label: string, act: () => void) => { this.addButton(id, x, by, bw, bh, label, act); by += bh + gap; };
    row('pauseResume', 'Resume', () => this.sm.resume());
    row('pauseRestart', 'Restart', () => { this.sm.resume(); this.sm.currentScreen?.pausable?.restart(); });
    row('pauseSettings', 'Settings', () => this.openSettings(true));
    row('pauseQuit', 'Quit to Build', () => { this.sm.resume(); this.sm.currentScreen?.pausable?.quit(); });
  }

  private buildSettings() {
    const pw = 440, ph = 720;
    const { x, y } = this.panelBox(pw, ph, 'SETTINGS');
    let cy = y + 74;
    const stepper = (id: 'master' | 'sfx', label: string, get: () => number, set: (v: number) => void) => {
      const l = makeText(label, 18, THEME.text, { fontWeight: 'bold' });
      l.position.set(x + 24, cy + 12);
      this.panel.addChild(l);
      const v = makeText(fmtPct(get()), 20, THEME.text, { fontWeight: 'bold' });
      v.anchor.set(0.5, 0);
      v.position.set(x + pw - 130, cy + 10);
      this.panel.addChild(v);
      this.valueTexts.set(id, v);
      this.addButton(`${id}Down`, x + pw - 210, cy, 44, 44, '-', () => { set(get() - VOLUME_STEP); v.text = fmtPct(get()); }, 26);
      this.addButton(`${id}Up`, x + pw - 68, cy, 44, 44, '+', () => { set(get() + VOLUME_STEP); v.text = fmtPct(get()); }, 26);
      cy += 62;
    };
    stepper('master', 'Master volume', () => sfx.settings.masterVolume, (v) => sfx.setMasterVolume(round1(v)));
    stepper('sfx', 'SFX volume', () => sfx.settings.sfxVolume, (v) => sfx.setSfxVolume(round1(v)));
    const toggle = (id: string, label: () => string, act: () => void) => {
      const b = this.addButton(id, x + 24, cy, pw - 48, 48, label(), () => { act(); b.text.text = label(); });
      cy += 60;
    };
    toggle('mute', () => `Sound: ${sfx.settings.muted ? 'MUTED' : 'ON'}`, () => sfx.setMuted(!sfx.settings.muted));
    const WORD: Record<string, string> = { off: 'Off', soft: 'Soft', normal: 'Normal' };
    toggle('weapon', () => `Weapon sound: ${WORD[sfx.settings.weaponSound]}`, () => {
      const i = WEAPON_SOUNDS.indexOf(sfx.settings.weaponSound);
      sfx.setWeaponSound(WEAPON_SOUNDS[(i + 1) % WEAPON_SOUNDS.length]);
      sfx.unlock();
      sfx.playShot();
    });
    toggle('statsToggle', () => `Stats panel: ${this.sm.stats.enabled ? 'ON' : 'OFF'}`, () => this.sm.stats.toggle());
    this.addButton('testSound', x + 24, cy, pw - 48, 48, 'Test sound', () => { sfx.unlock(); if (!sfx.playShot()) sfx.play('rockPop'); });
    cy += 60;
    this.addButton('exportSave', x + 24, cy, (pw - 60) / 2, 48, 'Export save', () => openExportSave());
    this.addButton('importSave', x + 36 + (pw - 60) / 2, cy, (pw - 60) / 2, 48, 'Import save', () => openImportSave());
    cy += 60;
    this.addButton('resetSave', x + 24, cy, pw - 48, 48, 'Reset save...', () => this.show('confirm'));
    cy += 60;
    this.addButton('settingsBack', x + 24, cy, pw - 48, 48, 'Back', () => this.closeSettings());
    const ver = makeText(VERSION_LABEL, 14, THEME.textDim);
    ver.anchor.set(0.5, 0);
    ver.position.set(W / 2, cy + 58);
    this.panel.addChild(ver);
  }

  private buildConfirm() {
    const pw = 420, ph = 250;
    const { x, y } = this.panelBox(pw, ph, 'RESET SAVE?');
    const t = makeText('This erases ALL progress: credits, blocks,\nhulls, medals and your saved circuit.\nIt cannot be undone.', 17, THEME.textDim, { align: 'center', lineHeight: 24 });
    t.anchor.set(0.5, 0);
    t.position.set(W / 2, y + 64);
    this.panel.addChild(t);
    this.addButton('resetYes', x + 24, y + ph - 76, 172, 52, 'Yes, erase', () => resetSave());
    this.addButton('resetNo', x + pw - 196, y + ph - 76, 172, 52, 'Cancel', () => this.show('settings'));
  }
}

const round1 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;

/** Erases the saved progress and the saved circuit (the volume settings stay), then reloads so every cache starts fresh. */
export function resetSave(storage: Pick<Storage, 'removeItem'> | null = safeStorage(), reload: () => void = () => location.reload()) {
  for (const k of [PROGRESS_KEY, STORAGE_KEY, LEGACY_KEY]) {
    try { storage?.removeItem(k); } catch { /* storage blocked */ }
  }
  reload();
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
