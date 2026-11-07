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
import { installAudioUnlock, sfx } from './audio';
import { DEBUG_ON } from './debug/enabled';
import { FRAME_MAX, planSteps } from './game/timestep';
import { PlayTimeTracker } from './econ/playTime';
import { getProgressStore } from './econ/progress';
import { frameLimitFps } from './ui/touchMode';
import { backToCarousel, openMapTab, openModeScreen, startCampaignTier, startDailyRun, startFreeFly } from './map/nav';
import { mapMemory } from './map/memory';
import { MapMode } from './map/constants';

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

  installAudioUnlock();
  const input = new InputManager(canvas);
  const screenManager = new ScreenManager(app, input);
  const stats = screenManager.stats;
  screenManager.mountStats();
  screenManager.mountOverlays();
  screenManager.installPauseTriggers();
  // The stats go beside the game when the window has room for them, else into the canvas; re-decided on every resize.
  stats.layout();
  window.addEventListener('resize', () => { fit(); stats.layout(); });
  // Backtick toggles the stats overlay (also ?stats=1 / ?stats=0; the choice is remembered).
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') stats.toggle();
  });
  if (DEBUG_ON) {
    (window as any).__mgbmStats = stats;
    (window as any).__mgbmSm = screenManager;
    (window as any).__mgbmSfx = sfx;
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
  if (DEBUG_ON) {
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
  if (DEBUG_ON) {
    // Chunk 29b: navigation hooks for the e2e scripts, so they never depend on where a button sits (`window.__mgbm` is replaced by every screen, this one stays).
    (window as any).__mgbmNav = {
      /** The Map tab, exactly as a tap on it behaves (remembered mode screen, else the carousel). */
      openMapTab: () => openMapTab(screenManager),
      /** A mode's own screen: 'campaign' (optionally selecting a tier), 'frontier', 'freefly'. False when the mode is locked. */
      openMode: (mode: MapMode, tier?: number) => openModeScreen(screenManager, mode, { tier }),
      /** The "<" of a mode screen. */
      backToCarousel: (mode: MapMode) => backToCarousel(screenManager, mode),
      /** Starts Free Fly with the current circuit (what the Free Fly screen's START does): 'ok' | 'noEjector'. */
      startFreeFly: () => startFreeFly(screenManager),
      /** Chunk 35a: starts today's daily run (what the Daily screen's START does). */
      startDaily: () => startDailyRun(screenManager),
      /** Starts campaign tier `tier` with the current circuit (what the tier panel's START does): 'ok' | 'locked' | 'noEjector'. */
      startTier: (tier: number) => startCampaignTier(screenManager, tier),
      /** `startMode('freefly')` or `startMode('campaign', tier)`. */
      startMode: (mode: MapMode, tier?: number) => (mode === 'freefly' ? startFreeFly(screenManager) : mode === 'campaign' ? startCampaignTier(screenManager, tier ?? 1) : openModeScreen(screenManager, mode) ? 'ok' : 'locked'),
      memory: () => mapMemory().get(),
    };
  }
  new DebugPanel().init();
  screenManager.switchTo(new BuildScreen(screenManager));

  let lastTime = performance.now();
  // Chunk 24a: time played, counted while the page is visible; saved every 15 s of play and when the page is hidden or closed.
  const store = getProgressStore();
  const playTime = new PlayTimeTracker((s) => store.addPlayTime(s), () => store.flushPlayTime());
  document.addEventListener('visibilitychange', () => { if (document.hidden) playTime.save(); });
  window.addEventListener('pagehide', () => playTime.save());
  app.ticker.maxFPS = 0; // 0 = no cap: one render per requestAnimationFrame, whatever the display's rate

  // Chunk 24a: no frame-rate cap (the ticker has no maxFPS) and no fixed 60 Hz step: every frame is simulated with the time that really
  // passed, in steps of at most 1/60 s (src/game/timestep.ts), so a 120 Hz screen gets a new picture on every frame at the same game speed.
  app.ticker.add(() => {
    // Chunk 28b: Settings > Graphics > Frame rate limit (Auto = no cap, 30, 60). The ticker skips frames above the cap.
    const cap = frameLimitFps(sfx.settings.frameLimit);
    if (app.ticker.maxFPS !== cap) app.ticker.maxFPS = cap;
    const now = performance.now();
    const rawMs = now - lastTime;
    const frameTime = Math.min(rawMs / 1000, FRAME_MAX);
    lastTime = now;
    playTime.tick(frameTime, !document.hidden);
    const plan = planSteps(frameTime);
    // debugHooks.timeScale > 1 (?debug=1 only) runs extra simulation steps per tick.
    for (let i = 0; i < plan.steps; i++) {
      for (let k = 0; k < debugHooks.timeScale; k++) screenManager.update(plan.dt, i === 0 && k === 0 ? frameTime : 0, now);
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
