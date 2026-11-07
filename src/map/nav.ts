import { ScreenManager } from '../screens/ScreenManager';
import { MapCarouselScreen } from '../screens/MapCarouselScreen';
import { MapScreen } from '../screens/MapScreen';
import { FrontierScreen } from '../screens/FrontierScreen';
import { FreeFlyHomeScreen } from '../screens/FreeFlyHomeScreen';
import { DailyScreen } from '../screens/DailyScreen';
import { twistOf } from '../daily/rules';
import { FlyScreen } from '../screens/FlyScreen';
import { WallScreen } from '../screens/WallScreen';
import { getBuilderModel } from '../builder/session';
import { getProgressStore, isUnlocked } from '../econ/progress';
import { generateLevel } from '../wall/generator';
import { endChallengeSession } from '../challenges/session';
import { MapMode } from './constants';
import { mapMemory } from './memory';
import { modeOpen, tabTarget } from './modes';

/** Chunk 29b: the one place that decides where the Map tab, the "<" button and the run summaries' Map button go. */

/** The Map tab was tapped (from any screen): the remembered mode screen, or the carousel when "<" was the last thing pressed. */
export function openMapTab(sm: ScreenManager) {
  const mode = tabTarget(mapMemory().get(), getProgressStore().data);
  if (mode) openModeScreen(sm, mode); else sm.switchTo(new MapCarouselScreen(sm));
}

/** Opens a mode's own screen (a locked mode is refused). */
export function openModeScreen(sm: ScreenManager, mode: MapMode, opts: { tier?: number } = {}): boolean {
  if (!modeOpen(mode, getProgressStore().data)) return false;
  mapMemory().setOpen(mode);
  if (mode === 'campaign') sm.switchTo(new MapScreen(sm, opts.tier));
  else if (mode === 'frontier') sm.switchTo(new FrontierScreen(sm));
  else if (mode === 'daily') sm.switchTo(new DailyScreen(sm));
  else sm.switchTo(new FreeFlyHomeScreen(sm));
  return true;
}

/** The "<" button of a mode screen: the carousel, centred on that mode. */
export function backToCarousel(sm: ScreenManager, mode: MapMode) {
  mapMemory().backToCarousel(mode);
  sm.switchTo(new MapCarouselScreen(sm));
}

export type StartResult = 'ok' | 'locked' | 'noEjector';

/** Starts Free Fly with the current circuit. */
export function startFreeFly(sm: ScreenManager): StartResult {
  const model = getBuilderModel();
  if (model.compiled.recipes.length === 0) return 'noEjector';
  sm.switchTo(new FlyScreen(sm, model.gridForFlight()));
  return 'ok';
}

/** Chunk 35a: starts today's daily run (Free Fly with the day's seed and twist). */
export function startDailyRun(sm: ScreenManager): StartResult {
  const model = getBuilderModel();
  if (model.compiled.recipes.length === 0) return 'noEjector';
  const store = getProgressStore();
  store.refreshDaily();
  const day = store.today;
  sm.switchTo(new FlyScreen(sm, model.gridForFlight(), { daily: { day, twistId: twistOf(day).id } }));
  return 'ok';
}

/** Starts a campaign tier with the current circuit (a normal tier is not a challenge run). */
export function startCampaignTier(sm: ScreenManager, tier: number): StartResult {
  if (!isUnlocked(getProgressStore().data, tier)) return 'locked';
  const model = getBuilderModel();
  if (model.compiled.recipes.length === 0) return 'noEjector';
  endChallengeSession();
  sm.switchTo(new WallScreen(sm, generateLevel(tier), model.gridForFlight()));
  return 'ok';
}

export const NO_EJECTOR_TEXT = "Your circuit doesn't reach an ejector";
