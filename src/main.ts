/// <reference types="vite/client" />

import { Application } from 'pixi.js';
import { CONFIG } from './config';
import { InputManager } from './input';
import { ScreenManager } from './screens/ScreenManager';
import { BuildScreen } from './screens/BuildScreen';
import { DebugPanel } from './debug/panel';
import { debugHooks } from './debug/hooks';
import { WallScreen } from './screens/WallScreen';
import { getBuilderModel } from './builder/session';
import { buildStarterGrid } from './game/starter';
import { makeTestWall } from './wall/level';

const perfDiv = document.createElement('div');
perfDiv.style.position = 'absolute';
perfDiv.style.top = '10px';
perfDiv.style.left = '10px';
perfDiv.style.color = 'lime';
perfDiv.style.fontFamily = 'monospace';
perfDiv.style.pointerEvents = 'none';
perfDiv.style.zIndex = '1000';
perfDiv.style.display = 'none';
document.body.appendChild(perfDiv);

(async () => {
  const app = new Application();
  await app.init({
    width: CONFIG.VIEW.W,
    height: CONFIG.VIEW.H,
    backgroundColor: 0x111111,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  const canvas = app.canvas as HTMLCanvasElement;
  document.getElementById('game-container')?.appendChild(canvas);

  function fit() {
    const s = Math.min(window.innerWidth / CONFIG.VIEW.W, window.innerHeight / CONFIG.VIEW.H);
    canvas.style.width = `${Math.floor(CONFIG.VIEW.W * s)}px`;
    canvas.style.height = `${Math.floor(CONFIG.VIEW.H * s)}px`;
  }
  fit();
  window.addEventListener('resize', fit);

  const input = new InputManager(canvas);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
      perfDiv.style.display = perfDiv.style.display === 'none' ? 'block' : 'none';
    }
  });

  const screenManager = new ScreenManager(app, input);
  // ?debug=1: the panel can start a test wall with the current circuit (the starter circuit if it has no ejector).
  debugHooks.startWall = (o) => {
    const model = getBuilderModel();
    const grid = model.compiled.recipes.length > 0 ? model.gridForFlight() : buildStarterGrid();
    const level = makeTestWall({ tier: o.tier, rows: o.rows ?? 8, armorFraction: o.armorFraction, shieldFraction: o.shieldFraction, gaps: 6 });
    screenManager.switchTo(new WallScreen(screenManager, level, grid));
  };
  new DebugPanel().init();
  screenManager.switchTo(new BuildScreen(screenManager));

  const dt = 1 / 60;
  let accumulator = 0;
  let lastTime = performance.now();

  app.ticker.add(() => {
    const now = performance.now();
    let frameTime = (now - lastTime) / 1000;
    lastTime = now;
    if (frameTime > 0.25) frameTime = 0.25;
    accumulator += frameTime;
    
    while (accumulator >= dt) {
      // debugHooks.timeScale > 1 (?debug=1 only) runs extra simulation steps per tick.
      for (let k = 0; k < debugHooks.timeScale; k++) screenManager.update(dt, k === 0 ? frameTime : 0, now);
      accumulator -= dt;
    }

    if (perfDiv.style.display === 'block') {
      perfDiv.innerText = `FPS: ${Math.round(app.ticker.FPS)}`;
    }
  });
})();
