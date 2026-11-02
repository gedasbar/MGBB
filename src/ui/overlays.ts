import { Container, Graphics, Text } from 'pixi.js';
import { CONFIG } from '../config';
import { makeText } from '../builder/ui';
import { sfx } from '../audio';
import { THEME } from './theme';
import { FRAME_LIMITS, TOUCH_GAIN_MAX, TOUCH_GAIN_MIN, TOUCH_GAIN_STEP, TRAIL_MODES, WEAPON_SOUNDS } from './settings';
import { BUILD_KEY_HELP } from '../builder/keys';
import type { ScreenManager } from '../screens/ScreenManager';
import { PROGRESS_KEY } from '../econ/progress';
import { LEGACY_KEY, STORAGE_KEY } from '../builder/persist';
import { VERSION_LABEL } from '../version';
import { fmtPlayTime, playTimeGuard } from '../econ/playTime';
import { AchievementSummary, getProgressStore } from '../econ/progress';
import { rewardText } from '../achievements/rules';
import { openExportSave, openImportSave } from './saveTransferUi';

const W = CONFIG.VIEW.W;
const H = CONFIG.VIEW.H;
/** The pause button in the top-right corner of the fly screens. */
const PAUSE_BTN = { x: W - 46, y: 8, w: 38, h: 38 };
/** A finger is bigger than the button: a press this close to it still belongs to the button, not to the ship. */
const PAUSE_HIT_PAD = 10;
/** Volume buttons move the volume this much per tap. */
const VOLUME_STEP = 0.1;
/** Taps this soon after the panel was closed are still treated as part of the closing tap (the screen below ignores them). */
const CLOSE_GUARD_MS = 150;

type View = 'none' | 'pause' | 'settings' | 'confirm' | 'confirm2' | 'achSummary';
/** Chunk 28a: how long one achievement toast stays, and the names the load summary lists before "and N more". */
const ACH_TOAST_MS = 3200;
const SUMMARY_NAMES = 8;
/** `content`: a button of the scrolling settings list, its y is measured from the top of the list (not of the screen). `act` gets the tap's x (the slider reads it). */
interface Btn { id: string; x: number; y: number; w: number; h: number; label: string; act: (x: number) => void; node: Container; text: Text; face: Graphics; content?: boolean }

/** Chunk 28b: the settings panel (sections, scrolls). Panel size, the scrolling list's top below the title and its height above the Back button. */
const SET_PW = 480;
const SET_PH = H - 48;
const SET_TITLE_H = 64;
const SET_BACK_H = 76;
const SET_ROW_H = 48;
const SET_ROW_GAP = 8;
const SET_SECTION_H = 40;
/** The keys that are not the Build screen's (the Build ones come from BUILD_KEY_HELP). */
const OTHER_KEYS: readonly string[] = ['Esc or P: pause a run (Esc also closes this panel)', 'Backtick (`): stats overlay on / off'];

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
  /** Chunk 28b: the settings list's content container (scrolls inside a mask), its scroll and its total height. */
  private contentC: Container | null = null;
  private settingsScroll = 0;
  private contentH = 0;
  /** Chunk 28a: the achievement toast (top of the screen, one at a time) and the load summary waiting to be shown. */
  private toastC = new Container();
  private toastBg = new Graphics();
  private toastText = makeText('', 16, THEME.text, { fontWeight: 'bold', align: 'center', wordWrap: true, wordWrapWidth: W - 80 });
  private toastUntil = 0;
  private summary: AchievementSummary | null = null;

  constructor(private sm: ScreenManager, private now: () => number = () => performance.now()) {
    this.dim.rect(0, 0, W, H).fill({ color: THEME.dim, alpha: 0.6 });
    this.dim.visible = false;
    this.pauseBtnFace.rect(0, 0, PAUSE_BTN.w, PAUSE_BTN.h).fill({ color: THEME.panel, alpha: 0.85 }).stroke({ color: THEME.buttonLine, width: 1.5 });
    this.pauseBtnFace.rect(11, 10, 6, 18).fill(THEME.buttonIcon).rect(21, 10, 6, 18).fill(THEME.buttonIcon);
    this.pauseBtn.addChild(this.pauseBtnFace);
    this.pauseBtn.position.set(PAUSE_BTN.x, PAUSE_BTN.y);
    this.pauseBtn.visible = false;
    this.toastText.anchor.set(0.5);
    this.toastC.addChild(this.toastBg, this.toastText);
    this.toastC.visible = false;
    this.container.addChild(this.pauseBtn, this.dim, this.panel, this.toastC);
  }

  /** The text of the achievement toast showing now ('' = none), for the e2e hook. */
  get toastMessage(): string { return this.toastC.visible ? this.toastText.text : ''; }

  /** Which panel is showing: 'none' | 'pause' | 'settings' | 'confirm' (for tests and the e2e hook). */
  get current(): View { return this.view; }

  /** Centre of a panel button in game coordinates (for the e2e test). */
  buttonCenter(id: string): { x: number; y: number } | null {
    const b = this.buttons.find(bb => bb.id === id);
    if (!b) return null;
    if (!b.content) return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    this.revealContent(b.y, b.h); // a button of the scrolling list: scroll it into view first
    return { x: b.x + b.w / 2, y: this.areaTop + b.y - this.settingsScroll + b.h / 2 };
  }

  /** Top of the settings list on the screen, and its height. */
  private get areaTop(): number { return (H - SET_PH) / 2 + SET_TITLE_H; }
  private get areaH(): number { return SET_PH - SET_TITLE_H - SET_BACK_H; }

  private applySettingsScroll() {
    this.settingsScroll = Math.max(0, Math.min(Math.max(0, this.contentH - this.areaH), this.settingsScroll));
    this.contentC?.position.set(0, this.areaTop - this.settingsScroll);
  }

  private revealContent(y: number, h: number) {
    if (y < this.settingsScroll) this.settingsScroll = y - 8;
    else if (y + h > this.settingsScroll + this.areaH) this.settingsScroll = y + h - this.areaH + 8;
    this.applySettingsScroll();
  }

  /** Scrolls the open settings list by a drag (game px) or the wheel. */
  drag(dy: number) { if (this.view === 'settings') { this.settingsScroll -= dy; this.applySettingsScroll(); } }
  wheel(dy: number) { if (this.view === 'settings') { this.settingsScroll += dy; this.applySettingsScroll(); } }

  /** For the e2e hook: how far the settings list is scrolled and how tall it is. */
  get settingsState(): { scroll: number; contentH: number; areaH: number } { return { scroll: this.settingsScroll, contentH: this.contentH, areaH: this.areaH }; }

  /** True while the screen underneath must ignore taps and drags (a panel is open, or just closed with this tap). */
  get blocking(): boolean { return this.view !== 'none' || this.now() - this.closedAt < CLOSE_GUARD_MS; }

  /** Chunk 24a: true when a game point is on a UI control: the pause button while it shows, or anything while a panel is open. The press never steers the ship. */
  hitsUi(x: number, y: number): boolean {
    if (this.view !== 'none') return true;
    if (!this.pauseBtn.visible) return false;
    const pad = PAUSE_HIT_PAD;
    return x >= PAUSE_BTN.x - pad && x <= PAUSE_BTN.x + PAUSE_BTN.w + pad && y >= PAUSE_BTN.y - pad && y <= PAUSE_BTN.y + PAUSE_BTN.h + pad;
  }

  /** Per-frame sync: the pause button follows whether the current screen can be paused right now. */
  update() {
    this.pollAchievements();
    const can = this.view === 'none' && !this.sm.paused && !!this.sm.currentScreen?.pausable?.canPause();
    if (this.pauseBtn.visible !== can) this.pauseBtn.visible = can;
    // The pause menu is open exactly while the manager is paused (Escape, blur or the button all go through the manager).
    if (this.sm.paused && this.view === 'none') this.show('pause');
    else if (!this.sm.paused && this.view === 'pause') this.hide();
  }

  /** Chunk 28a: shows the one-time load summary when no panel is open, else the achievements earned since, one toast at a time. */
  private pollAchievements() {
    const store = getProgressStore();
    if (!this.summary) this.summary = store.takeAchievementSummary();
    if (this.summary && this.view === 'none' && !this.sm.paused) { this.show('achSummary'); return; }
    const t = this.now();
    if (this.toastC.visible && t >= this.toastUntil) this.toastC.visible = false;
    if (!this.toastC.visible && store.hasAchievementToasts && !this.summary) {
      const a = store.takeAchievementToasts();
      // Several at once (a run that earns two): one toast naming them, never a queue to sit through.
      const first = a[0];
      const more = a.length > 1 ? ` and ${a.length - 1} more` : '';
      const medals = a.reduce((n, d) => n + ('medals' in d.reward ? d.reward.medals : 0), 0);
      this.toastText.text = `Achievement: ${first.name}${more}
${a.length === 1 ? rewardText(first.reward) : `${medals} Medal${medals === 1 ? '' : 's'}`}`;
      const w = Math.min(W - 40, this.toastText.width + 40), h = this.toastText.height + 20;
      this.toastBg.clear().rect(W / 2 - w / 2, 64 - h / 2, w, h).fill(THEME.panel).stroke({ color: THEME.good, width: 2 });
      this.toastText.position.set(W / 2, 64);
      this.toastC.visible = true;
      this.toastUntil = t + ACH_TOAST_MS;
    }
  }

  // ------------------------------------------------------------------ opening and closing
  openSettings(fromPause = false) {
    this.settingsFromPause = fromPause;
    this.show('settings');
  }

  /** Escape: back out of the settings, or toggle the pause menu. Returns whether it did something. */
  escape(): boolean {
    if (this.view === 'confirm' || this.view === 'confirm2') { this.show('settings'); return true; }
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
    this.contentC = null;
  }

  private show(v: View) {
    if (v !== 'settings') this.settingsScroll = 0;
    this.view = v;
    this.openedAt = this.now();
    this.dim.visible = true;
    this.clearPanel();
    if (v === 'pause') this.buildPause();
    else if (v === 'settings') this.buildSettings();
    else if (v === 'confirm') this.buildConfirm(false);
    else if (v === 'confirm2') this.buildConfirm(true);
    else if (v === 'achSummary') this.buildAchSummary();
  }

  // ------------------------------------------------------------------ taps
  /** Returns true when the tap was taken (a panel is open, or it hit the pause button). */
  tap(x: number, y: number): boolean {
    if (this.view === 'none') {
      if (!this.pauseBtn.visible) return false;
      if (this.hitsUi(x, y)) {
        sfx.play('uiTap');
        this.sm.pause();
        return true;
      }
      return false;
    }
    if (this.now() - this.openedAt < 60) return true; // the tap that opened the panel
    for (const b of this.buttons) {
      const by = b.content ? this.areaTop + b.y - this.settingsScroll : b.y;
      if (b.content && (y < this.areaTop || y > this.areaTop + this.areaH)) continue; // scrolled out of the list
      if (x >= b.x && x <= b.x + b.w && y >= by && y <= by + b.h) {
        sfx.play('uiTap');
        b.act(x);
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

  private addButton(id: string, x: number, y: number, w: number, h: number, label: string, act: (x: number) => void, size = 20, parent: Container = this.panel, content = false): Btn {
    const node = new Container();
    const face = new Graphics();
    const text = makeText(label, size, THEME.text, { fontWeight: 'bold' });
    text.anchor.set(0.5);
    text.position.set(x + w / 2, y + h / 2);
    this.drawFace(face, x, y, w, h, false);
    node.addChild(face, text);
    parent.addChild(node);
    const b: Btn = { id, x, y, w, h, label, act, node, text, face, content };
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
    const pw = SET_PW, ph = SET_PH;
    const { x, y } = this.panelBox(pw, ph, 'SETTINGS');
    const areaTop = y + SET_TITLE_H, areaH = ph - SET_TITLE_H - SET_BACK_H;
    // The list scrolls inside a mask; its buttons are positioned from the top of the list (content coordinates).
    const content = new Container();
    const mask = new Graphics().rect(x + 2, areaTop, pw - 4, areaH).fill(0xffffff);
    content.mask = mask;
    this.panel.addChild(content, mask);
    this.contentC = content;
    const L = x + 24, FW = pw - 48;
    let cy = 6;
    const btn = (id: string, bx: number, by: number, bw: number, label: string, act: (px: number) => void, size = 20) => this.addButton(id, bx, by, bw, SET_ROW_H, label, act, size, content, true);
    const section = (title: string) => {
      const t = makeText(title.toUpperCase(), 17, THEME.currency, { fontWeight: 'bold' });
      t.position.set(L, cy + 10);
      content.addChild(t, new Graphics().rect(L, cy + 34, FW, 2).fill(THEME.border));
      cy += SET_SECTION_H;
    };
    const next = () => { cy += SET_ROW_H + SET_ROW_GAP; };
    const toggle = (id: string, label: () => string, act: () => void) => {
      const b = btn(id, L, cy, FW, label(), () => { act(); b.text.text = label(); });
      next();
    };
    const stepper = (id: 'master' | 'sfx', label: string, get: () => number, set: (v: number) => void) => {
      const l = makeText(label, 18, THEME.text, { fontWeight: 'bold' });
      l.position.set(L, cy + 12);
      content.addChild(l);
      const v = makeText(fmtPct(get()), 20, THEME.text, { fontWeight: 'bold' });
      v.anchor.set(0.5, 0);
      v.position.set(x + pw - 130, cy + 10);
      content.addChild(v);
      this.valueTexts.set(id, v);
      btn(`${id}Down`, x + pw - 210, cy, 44, '-', () => { set(get() - VOLUME_STEP); v.text = fmtPct(get()); }, 26);
      btn(`${id}Up`, x + pw - 68, cy, 44, '+', () => { set(get() + VOLUME_STEP); v.text = fmtPct(get()); }, 26);
      next();
    };

    // ---- Graphics
    section('Graphics');
    const LIMIT_WORD = (l: number) => (l === 0 ? 'Auto' : `${l} fps`);
    toggle('frameLimit', () => `Frame rate limit: ${LIMIT_WORD(sfx.settings.frameLimit)}`, () => {
      const i = FRAME_LIMITS.indexOf(sfx.settings.frameLimit);
      sfx.set('frameLimit', FRAME_LIMITS[(i + 1) % FRAME_LIMITS.length]);
    });
    const TRAIL_WORD: Record<string, string> = { off: 'Off', short: 'Short', long: 'Long' };
    toggle('trails', () => `Trails: ${TRAIL_WORD[sfx.settings.trails]}`, () => {
      const i = TRAIL_MODES.indexOf(sfx.settings.trails);
      sfx.set('trails', TRAIL_MODES[(i + 1) % TRAIL_MODES.length]);
    });
    toggle('backgrounds', () => `Backgrounds: ${sfx.settings.backgrounds ? 'ON' : 'OFF'}`, () => sfx.set('backgrounds', !sfx.settings.backgrounds));
    toggle('damageNumbers', () => `Damage numbers: ${sfx.settings.damageNumbers ? 'ON' : 'OFF'}`, () => sfx.set('damageNumbers', !sfx.settings.damageNumbers));
    toggle('statsToggle', () => `Stats overlay: ${this.sm.stats.enabled ? 'ON' : 'OFF'}`, () => this.sm.stats.toggle());

    // ---- Controls
    section('Controls');
    toggle('touchControl', () => `Touch control: ${sfx.settings.touchControl === 'direct' ? 'Direct' : 'Relative'}`, () => sfx.setTouchControl(sfx.settings.touchControl === 'direct' ? 'relative' : 'direct'));
    {
      // Touch sensitivity: a slider with TOUCH_GAIN_STEP stops (tap the track), with - and + beside it.
      const l = makeText('Touch sensitivity', 18, THEME.text, { fontWeight: 'bold' });
      l.position.set(L, cy + 2);
      const val = makeText(`${sfx.settings.touchGain.toFixed(2)}x`, 18, THEME.currency, { fontWeight: 'bold' });
      val.anchor.set(1, 0);
      val.position.set(x + pw - 24, cy + 2);
      content.addChild(l, val);
      cy += 30;
      const trackX = L + 52, trackW = FW - 104;
      const knob = new Graphics();
      const track = new Graphics().rect(trackX, cy + SET_ROW_H / 2 - 3, trackW, 6).fill(THEME.border);
      content.addChild(track, knob);
      const frac = () => (sfx.settings.touchGain - TOUCH_GAIN_MIN) / (TOUCH_GAIN_MAX - TOUCH_GAIN_MIN);
      const draw = () => {
        knob.clear().rect(trackX + frac() * trackW - 9, cy + SET_ROW_H / 2 - 14, 18, 28).fill(THEME.currency);
        val.text = `${sfx.settings.touchGain.toFixed(2)}x`;
      };
      draw();
      const rowY = cy;
      const setGain = (v: number) => { sfx.set('touchGain', v); draw(); };
      btn('gainDown', L, rowY, 44, '-', () => setGain(sfx.settings.touchGain - TOUCH_GAIN_STEP), 26);
      btn('gainUp', x + pw - 68, rowY, 44, '+', () => setGain(sfx.settings.touchGain + TOUCH_GAIN_STEP), 26);
      const slider = btn('gainSlider', trackX, rowY, trackW, '', (px) => setGain(TOUCH_GAIN_MIN + Math.max(0, Math.min(1, (px - trackX) / trackW)) * (TOUCH_GAIN_MAX - TOUCH_GAIN_MIN)));
      slider.face.clear(); // the track is its own drawing
      next();
    }
    {
      const keys = ['Keyboard keys', ...BUILD_KEY_HELP, ...OTHER_KEYS].join('\n');
      const t = makeText(keys, 14, THEME.textDim, { lineHeight: 20, wordWrap: true, wordWrapWidth: FW });
      t.position.set(L, cy);
      content.addChild(t);
      cy += t.height + SET_ROW_GAP;
    }

    // ---- Audio
    section('Audio');
    stepper('master', 'Volume', () => sfx.settings.masterVolume, (v) => sfx.setMasterVolume(round1(v)));
    stepper('sfx', 'SFX volume', () => sfx.settings.sfxVolume, (v) => sfx.setSfxVolume(round1(v)));
    toggle('mute', () => `Sound: ${sfx.settings.muted ? 'MUTED' : 'ON'}`, () => sfx.setMuted(!sfx.settings.muted));
    const WORD: Record<string, string> = { off: 'Off', soft: 'Soft', normal: 'Normal' };
    toggle('weapon', () => `Weapon sound: ${WORD[sfx.settings.weaponSound]}`, () => {
      const i = WEAPON_SOUNDS.indexOf(sfx.settings.weaponSound);
      sfx.setWeaponSound(WEAPON_SOUNDS[(i + 1) % WEAPON_SOUNDS.length]);
      sfx.unlock();
      sfx.playShot();
    });
    btn('testSound', L, cy, FW, 'Test sound', () => { sfx.unlock(); if (!sfx.playShot()) sfx.play('rockPop'); });
    next();

    // ---- Data
    section('Data');
    btn('exportSave', L, cy, (FW - 12) / 2, 'Export save', () => openExportSave());
    btn('importSave', L + 12 + (FW - 12) / 2, cy, (FW - 12) / 2, 'Import save', () => openImportSave());
    next();
    btn('resetSave', L, cy, FW, 'Reset save...', () => this.show('confirm'));
    next();

    // ---- About
    section('About');
    const about = makeText(`Version  ${VERSION_LABEL}\nTime played  ${fmtPlayTime(getProgressStore().data.timePlayed)}`, 16, THEME.text, { lineHeight: 24 });
    about.position.set(L, cy + 2);
    content.addChild(about);
    cy += about.height + 16;

    this.contentH = cy;
    this.applySettingsScroll();
    this.addButton('settingsBack', x + 24, y + ph - SET_BACK_H + 14, pw - 48, 52, 'Back', () => this.closeSettings());
  }

  /** Chunk 28a: what the load granted at once. */
  private buildAchSummary() {
    const s = this.summary!;
    const shown = s.names.slice(0, SUMMARY_NAMES);
    const rest = s.count > shown.length ? [`and ${s.count - shown.length} more`] : [];
    const body = [...shown, ...rest].join('\n');
    const pw = 440, ph = 250 + shown.length * 22 + (s.count > shown.length ? 22 : 0);
    const { x, y } = this.panelBox(pw, ph, 'ACHIEVEMENTS');
    const head = makeText(`${s.count} unlocked from your progress`, 19, THEME.good, { fontWeight: 'bold' });
    head.anchor.set(0.5, 0);
    head.position.set(W / 2, y + 62);
    const pay = makeText(`${s.medals > 0 ? `+${s.medals} Medals` : ''}${s.medals > 0 && s.cosmetics > 0 ? '   ' : ''}${s.cosmetics > 0 ? `${s.cosmetics} cosmetic reward${s.cosmetics === 1 ? '' : 's'} (Customization tab)` : ''}`, 17, THEME.currency, { fontWeight: 'bold' });
    pay.anchor.set(0.5, 0);
    pay.position.set(W / 2, y + 92);
    const list = makeText(body, 16, THEME.textDim, { align: 'center', lineHeight: 22 });
    list.anchor.set(0.5, 0);
    list.position.set(W / 2, y + 126);
    this.panel.addChild(head, pay, list);
    this.addButton('achSummaryOk', x + 24, y + ph - 76, pw - 48, 52, 'OK', () => { this.summary = null; this.hide(); });
  }

  /** Resetting asks twice: the first panel says what is lost, the second is the last chance (chunk 28b). */
  private buildConfirm(second: boolean) {
    const pw = 420, ph = 250;
    const { x, y } = this.panelBox(pw, ph, second ? 'REALLY ERASE?' : 'RESET SAVE?');
    const t = makeText(second
      ? 'Last chance. Everything on this device\nis erased and the game restarts.\nExport the save first if unsure.'
      : 'This erases ALL progress: credits, blocks,\nhulls, medals and your saved circuit.\nIt cannot be undone.', 17, THEME.textDim, { align: 'center', lineHeight: 24 });
    t.anchor.set(0.5, 0);
    t.position.set(W / 2, y + 64);
    this.panel.addChild(t);
    if (second) {
      this.addButton('resetYes2', x + 24, y + ph - 76, 172, 52, 'Erase for good', () => resetSave());
      this.addButton('resetNo2', x + pw - 196, y + ph - 76, 172, 52, 'Cancel', () => this.show('settings'));
    } else {
      this.addButton('resetYes', x + 24, y + ph - 76, 172, 52, 'Yes, erase', () => this.show('confirm2'));
      this.addButton('resetNo', x + pw - 196, y + ph - 76, 172, 52, 'Cancel', () => this.show('settings'));
    }
  }
}

const round1 = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;

/** Erases the saved progress and the saved circuit (the volume settings stay), then reloads so every cache starts fresh. */
export function resetSave(storage: Pick<Storage, 'removeItem'> | null = safeStorage(), reload: () => void = () => location.reload()) {
  for (const k of [PROGRESS_KEY, STORAGE_KEY, LEGACY_KEY]) {
    try { storage?.removeItem(k); } catch { /* storage blocked */ }
  }
  playTimeGuard.blocked = true; // the reload must not write the old save back (time played is saved when the page hides)
  reload();
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
