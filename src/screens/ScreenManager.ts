import { Application, Container } from 'pixi.js';
import { InputManager } from '../input';
import { StatsInfo, StatsOverlay } from '../ui/stats';

export interface Screen {
  container: Container;
  init?(): void;
  update(dt: number, frameTime: number, now: number): void;
  destroy?(): void;
  /** Name shown by the stats overlay for screens without statsInfo. */
  statsName?: string;
  /** Fills the stats overlay (called about 4 times a second, only while it is visible). */
  statsInfo?(out: StatsInfo): void;
}

export class ScreenManager {
  currentScreen: Screen | null = null;

  constructor(public app: Application, public input: InputManager) {}

  switchTo(screen: Screen) {
    if (this.currentScreen) {
      if (this.currentScreen.destroy) this.currentScreen.destroy();
      this.app.stage.removeChild(this.currentScreen.container);
    }
    this.currentScreen = screen;
    this.app.stage.addChildAt(screen.container, 0);
    if (screen.init) screen.init();
  }

  update(dt: number, frameTime: number, now: number) {
    if (this.currentScreen) {
      this.currentScreen.update(dt, frameTime, now);
    }
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
