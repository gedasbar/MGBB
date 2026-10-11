import { BLOCKS } from '../data/blocks';
import { maxLevelOf } from '../econ/economy';
import { ProgressStore, defaultProgress } from '../econ/progress';
import { HULL_BUILDERS } from '../game/gridUtils';
import { MAX_TIER } from '../wall/generator';

/**
 * Dev cheats (?debug=1 panel, dev builds only). Each one changes the progress through the normal store and commits, so the
 * Build and Shop screens (which listen to the store) update at once and the change is saved like any other.
 */

export function addCredits(store: ProgressStore, n: number) {
  store.data.credits = Math.max(0, store.data.credits + Math.floor(n));
  store.commit();
}

/** Medals are one per cleared tier in a saved game: extra ones last until the page is reloaded (the loader caps them). */
export function addMedals(store: ProgressStore, n: number) {
  store.data.medals = Math.max(0, store.data.medals + Math.floor(n));
  store.commit();
}

/** `copies` of every block that exists (hidden ones too; they stay out of the picker until a chunk shows them), optionally at max level. */
export function ownAllBlocks(store: ProgressStore, copies: number, maxLevel: boolean) {
  const n = Math.max(0, Math.floor(copies));
  for (const id of Object.keys(BLOCKS)) {
    store.data.owned[id] = n;
    if (maxLevel) store.data.levels[id] = maxLevelOf(id);
    else store.data.levels[id] ??= 1;
  }
  store.commit();
}

export function ownAllHulls(store: ProgressStore) {
  for (const id of Object.keys(HULL_BUILDERS)) if (!store.data.ownedHulls.includes(id)) store.data.ownedHulls.push(id);
  store.commit();
}

/** Marks tiers 1..MAX_TIER passed (the Map opens them all). No Medal, nothing cleared, no best times. */
export function unlockAllTiers(store: ProgressStore) {
  const all = new Set([...store.data.passedTiers]);
  for (let t = 1; t <= MAX_TIER; t++) all.add(t);
  store.data.passedTiers = Array.from(all).sort((a, b) => a - b);
  store.commit();
}

/** Back to a fresh campaign: nothing passed or cleared, no bests, no Medals. Credits, blocks and hulls stay. */
export function resetCampaign(store: ProgressStore) {
  const d = defaultProgress();
  const p = store.data;
  p.clearedTiers = d.clearedTiers; p.passedTiers = d.passedTiers;
  p.wallBestPct = d.wallBestPct; p.wallBestTime = d.wallBestTime; p.wallBestClearTime = d.wallBestClearTime;
  p.medals = 0; p.highestCleared = 0;
  store.commit();
}

/** Back to the new-game state: progress through the store, and every saved circuit through the builder model. */
export function resetEverything(store: ProgressStore, builder?: { resetAll(): void } | null) {
  store.reset();
  builder?.resetAll();
}
