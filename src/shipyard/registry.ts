import { customHullInfo, CustomHullInfo, setCustomHull } from '../data/hulls';
import { HULL_BUILDERS, withHull } from '../game/gridUtils';
import type { RunModifiers } from '../captains/modifiers';
import { EXTRA_LIFE_INVULN, customHullId, customHullName, customSlotOf, MAX_DESIGNS } from './constants';
import { NEUTRAL_FLY } from './flyTraits';
import { compileDesign, designProblems, designStats, Design, shipyardOpen } from './design';

/**
 * Puts the player's flyable custom designs where the normal hulls are looked up (chunk 31a): the layout in `HULL_BUILDERS` (so the
 * builder, `persist`, the compiler and the flight build a grid for "custom1".."custom3" like for any hull) and the stats in
 * `data/hulls.ts` (pulse rate, shot speed, size class). Called by the progress store whenever the designs, the chunks or the
 * furthest Frontier ring change.
 */
export interface ShipyardView {
  chunks: Readonly<Record<string, number>>;
  designs: readonly (Design | null)[];
}

/** Why a design cannot fly (empty = it can): the Shipyard is closed, or the design's own problems. */
export function flightProblems(view: ShipyardView, slot: number, furthestRing: number): string[] {
  const d = view.designs[slot];
  if (!d) return ['This slot has no design'];
  if (!shipyardOpen(furthestRing)) return ['The Shipyard is not open yet'];
  return designProblems(d, view.chunks);
}

/** Slots (0-based) whose design flies now. */
export function flyableSlots(view: ShipyardView, furthestRing: number): number[] {
  const out: number[] = [];
  for (let s = 0; s < MAX_DESIGNS; s++) if (flightProblems(view, s, furthestRing).length === 0) out.push(s);
  return out;
}

/** The hull info of a design (null when it does not compile): the layout and the stats the lookups read. */
export function customHullOf(slot: number, d: Design): CustomHullInfo | null {
  const rows = compileDesign(d);
  const st = designStats(d);
  if (!rows || !st) return null;
  return {
    name: customHullName(slot), rows, damageMul: st.damageMul, lives: st.lives, coresMul: st.coresMul, fly: st.fly,
    stats: { name: customHullName(slot), price: 0, pulsesPerSec: st.pulsesPerSec, shotSpeed: st.shotSpeed, size: st.size },
  };
}

/** Registers the flyable designs and forgets the others. Returns the ids now registered. */
export function registerCustomHulls(view: ShipyardView, furthestRing: number): string[] {
  const live = new Set(flyableSlots(view, furthestRing));
  const ids: string[] = [];
  for (let s = 0; s < MAX_DESIGNS; s++) {
    const id = customHullId(s);
    const info = live.has(s) ? customHullOf(s, view.designs[s]!) : null;
    if (info) {
      setCustomHull(id, info);
      HULL_BUILDERS[id] = () => withHull(id, info.rows);
      ids.push(id);
    } else {
      setCustomHull(id, null);
      delete HULL_BUILDERS[id];
    }
  }
  return ids;
}

/**
 * The trait effects of the hull a run flies, folded into the run's modifiers (a normal hull changes nothing): damage x, Extra Life
 * as Second Chance charges (with its 1.5 s of untouchable time), Core Magnet as a Cores multiplier.
 */
export function applyHullTraits(mods: RunModifiers, hullId: string | undefined): RunModifiers {
  const c = customSlotOf(hullId ?? '') >= 0 ? customHullInfo(hullId) : undefined;
  if (!c) return mods;
  return {
    ...mods,
    damageMul: mods.damageMul * c.damageMul,
    secondChances: mods.secondChances + c.lives,
    chanceInvuln: c.lives > 0 ? Math.max(mods.chanceInvuln, EXTRA_LIFE_INVULN) : mods.chanceInvuln,
    coresMul: mods.coresMul * c.coresMul,
    fly: c.fly ?? NEUTRAL_FLY,
  };
}
