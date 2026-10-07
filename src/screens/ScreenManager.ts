import { Application, Container } from 'pixi.js';
import { InputManager } from '../input';

export interface Screen {
  container: Container;
  init?(): void;
  update(dt: number, frameTime: number, now: number): void;
  destroy?(): void;
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
    this.app.stage.addChild(screen.container);
    if (screen.init) screen.init();
  }

  update(dt: number, frameTime: number, now: number) {
    if (this.currentScreen) {
      this.currentScreen.update(dt, frameTime, now);
    }
  }
}
