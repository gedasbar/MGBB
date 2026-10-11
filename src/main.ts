/// <reference types="vite/client" />

import { Application, UPDATE_PRIORITY } from 'pixi.js';
import { CONFIG } from './config';
import { InputManager } from './input';
import { ScreenManager } from './screens/ScreenManager';
import { BuildScreen } from './screens/BuildScreen';
import { DebugPanel } from './debug/panel';
import { debugHooks } from './debug/hooks';
import { WallScreen } from './screens/WallScreen';
import { FlyScreen } from './screens/FlyScreen';
import { generateLevel } from './wall/generator';
import { getBuilderModel } from './builder/session';
import { buildStarterGrid } from './game/starter';
import { makeTestWall } from './wall/level';

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

  const input = new InputManager(canvas);
  const screenManager = new ScreenManager(app, input);
  const stats = screenManager.stats;
  screenManager.mountStats();
  // The stats go beside the game when the window has room for them, else into the canvas; re-decided on every resize.
  stats.layout();
  window.addEventListener('resize', () => { fit(); stats.layout(); });
  // Backtick toggles the stats overlay (also ?stats=1 / ?stats=0; the choice is remembered).
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') stats.toggle();
  });
  if (import.meta.env.DEV) {
    (window as any).__mgbmStats = stats;
    // For the e2e contact-sheet script: Pixi and the running app, so a sheet can be drawn with the game's own modules.
    void import('pixi.js').then((m) => { (window as any).__pixi = m; (window as any).__app = app; });
  }
  // ?debug=1: the panel can start a test wall with the current circuit (the starter circuit if it has no ejector).
  debugHooks.startWall = (o) => {
    const model = getBuilderModel();
    const grid = model.compiled.recipes.length > 0 ? model.gridForFlight() : buildStarterGrid();
    const level = makeTestWall({ tier: o.tier, rows: o.rows ?? 8, armorFraction: o.armorFraction, shieldFraction: o.shieldFraction, gaps: 6 });
    screenManager.switchTo(new WallScreen(screenManager, level, grid));
  };
  if (import.meta.env.DEV) {
    // Cheat panel hooks: Free Fly from a given wave, and any campaign tier whether or not it is unlocked.
    debugHooks.startFly = (wave) => {
      const model = getBuilderModel();
      const grid = model.compiled.recipes.length > 0 ? model.gridForFlight() : buildStarterGrid();
      screenManager.switchTo(new FlyScreen(screenManager, grid, { startWave: wave }));
    };
    debugHooks.startTier = (tier) => {
      const model = getBuilderModel();
      const grid = model.compiled.recipes.length > 0 ? model.gridForFlight() : buildStarterGrid();
      screenManager.switchTo(new WallScreen(screenManager, generateLevel(tier), grid));
    };
  }
  new DebugPanel().init();
  screenManager.switchTo(new BuildScreen(screenManager));

  const dt = 1 / 60;
  let accumulator = 0;
  let lastTime = performance.now();

  app.ticker.add(() => {
    const now = performance.now();
    const rawMs = now - lastTime;
    let frameTime = rawMs / 1000;
    lastTime = now;
    if (frameTime > 0.25) frameTime = 0.25;
    accumulator += frameTime;
    
    while (accumulator >= dt) {
      // debugHooks.timeScale > 1 (?debug=1 only) runs extra simulation steps per tick.
      for (let k = 0; k < debugHooks.timeScale; k++) screenManager.update(dt, k === 0 ? frameTime : 0, now);
      accumulator -= dt;
    }

    if (stats.enabled) {
      simEnd = performance.now();
      stats.frame(now, rawMs, simEnd - now);
    }
  });
  // Runs after the renderer's own listener (LOW priority): the gap since the end of the simulation is the draw call's CPU time.
  let simEnd = 0;
  app.ticker.add(() => {
    if (stats.enabled && simEnd > 0) stats.render(performance.now() - simEnd);
  }, null, UPDATE_PRIORITY.UTILITY);
})();
