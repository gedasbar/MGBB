import { Application, Container } from 'pixi.js';
import { InputManager } from '../input';
import { StatsInfo, StatsOverlay } from '../ui/stats';
import { PauseController } from '../game/pause';
import { Overlays } from '../ui/overlays';

/** What a fly screen offers the pause menu. */
export interface Pausable {
  /** Called on every pause trigger (button, key, tab hidden, blur), even when pausing is not allowed: saves what the run has so far. */
  persist?(): void;
  /** The run has started and is still going (pausing before the first move or after the end is not allowed). */
  canPause(): boolean;
  /** Called on resume: the ship eases back to the pointer. */
  resume(): void;
  /** Ends this run (credits so far are banked) and starts the same one again. */
  restart(): void;
  /** Ends the run like a crash would: banked, then the run summary. */
  quit(): void;
}

export interface Screen {
  container: Container;
  init?(): void;
  update(dt: number, frameTime: number, now: number): void;
  destroy?(): void;
  /** Name shown by the stats overlay for screens without statsInfo. */
  statsName?: string;
  /** Fills the stats overlay (called about 4 times a second, only while it is visible). */
  statsInfo?(out: StatsInfo): void;
  /** Present on the fly screens: the pause button and menu work on them. */
  pausable?: Pausable;
}

export class ScreenManager {
  currentScreen: Screen | null = null;

  constructor(public app: Application, public input: InputManager) {}

  /** Pause state; while paused update() does nothing, so the whole run is frozen (see PauseController). */
  readonly pauseCtl = new PauseController();
  /** Pause button, pause menu and settings panel (made by mountOverlays; null in headless tests). */
  overlays: Overlays | null = null;

  get paused(): boolean { return this.pauseCtl.paused; }

  /** Pauses the current run if it may be paused now (started, not over). Returns whether it paused. */
  pause(): boolean {
    const p = this.currentScreen?.pausable;
    p?.persist?.();
    if (!p || !p.canPause()) return false;
    return this.pauseCtl.pause();
  }

  resume() {
    if (this.pauseCtl.resume()) this.currentScreen?.pausable?.resume();
  }

  togglePause() {
    if (this.paused) this.resume(); else this.pause();
  }

  /** Escape / P: closes the settings panel if it is open, else toggles pause. */
  onPauseKey() {
    if (this.overlays?.escape()) return;
    this.togglePause();
  }

  switchTo(screen: Screen) {
    // A new screen never starts paused; the overlays close with it.
    this.pauseCtl.paused = false;
    if (this.currentScreen) {
      if (this.currentScreen.destroy) this.currentScreen.destroy();
      this.app.stage.removeChild(this.currentScreen.container);
    }
    this.currentScreen = screen;
    this.app.stage.addChildAt(screen.container, 0);
    if (screen.init) screen.init();
  }

  update(dt: number, frameTime: number, now: number) {
    this.overlays?.update();
    if (!this.pauseCtl.step(dt, frameTime)) return;
    if (this.currentScreen) {
      this.currentScreen.update(this.pauseCtl.dt, this.pauseCtl.frameTime, now);
    }
  }

  /** Adds the overlay layer above the screen and the stats plate; main.ts calls this once, after mountStats. */
  mountOverlays() {
    this.overlays = new Overlays(this);
    this.app.stage.addChild(this.overlays.container);
    this.input.onTap((x, y) => { this.overlays?.tap(x, y); });
  }

  /** Auto-pause triggers: Escape / P, the tab being hidden and the window losing focus. */
  installPauseTriggers(win: Window = window) {
    win.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return; // typing in the debug panel
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPauseKey();
    });
    win.addEventListener('blur', () => { this.pause(); });
    win.document.addEventListener('visibilitychange', () => { if (win.document.hidden) this.pause(); });
  }

  /** Screen-independent stats plate (top-left); screens read `stats.hudOffset` to keep their HUD below it. */
  readonly stats = new StatsOverlay();

  /** Adds the stats plate above everything; main.ts calls this once. */
  mountStats() {
    this.app.stage.addChild(this.stats.container);
    this.stats.provider = (out: StatsInfo) => {
      const s = this.currentScreen;
      if (s?.statsInfo) s.statsInfo(out); else out.name = s?.statsName ?? 'Menu';
    };
  }
}
