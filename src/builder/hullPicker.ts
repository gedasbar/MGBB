import { CONFIG } from '../config';
import { HULL_PRICE } from '../econ/economy';
import { HULL_BUILDERS, HULL_INFO } from '../game/gridUtils';
import { fireRateMul } from '../data/hulls';
import { BuilderModel } from './model';

/** Chunk 16e: the pure part of the builder's hull picker, which now also sells the hulls (the Shop is blocks only). */

export interface HullFacts {
  id: string;
  name: string;
  desc: string;
  /** Free cells between generator and ejectors: places for blocks. */
  slots: number;
  ejectors: number;
  /** Pulses per second the hull fires. */
  pulsesPerSecond: number;
  price: number;
}

/** Slots, ejectors, pulse rate and price of a hull, read from its grid and the hull tables (never typed in twice). */
export function hullFacts(id: string): HullFacts {
  const info = HULL_INFO.find(h => h.id === id);
  const grid = HULL_BUILDERS[id]?.();
  if (!info || !grid) throw new Error(`Unknown hull: ${id}`);
  return {
    id, name: info.name, desc: info.desc,
    slots: grid.cells.filter(c => c.type === 'empty').length,
    ejectors: grid.cells.filter(c => c.type === 'ejector').length,
    pulsesPerSecond: CONFIG.PULSE.BASE_RATE * fireRateMul(id),
    price: HULL_PRICE[id] ?? 0,
  };
}

/** The pulse rate as printed: 2, 2.5, 4, 5 (no trailing zeros). */
export function fmtPulse(pps: number): string {
  return `${Math.round(pps * 100) / 100}/s`;
}

/** One line for the info box: "Slots 2 · Ejectors 1 · 2.5 pulses/s". */
export function hullFactsLine(f: HullFacts): string {
  return `Slots ${f.slots} · Ejectors ${f.ejectors} · ${fmtPulse(f.pulsesPerSecond).replace('/s', ' pulses/s')}`;
}

export type HullRowState = 'current' | 'owned' | 'unowned';

export function hullRowState(ownedHulls: readonly string[], currentId: string, id: string): HullRowState {
  if (id === currentId) return 'current';
  return ownedHulls.includes(id) ? 'owned' : 'unowned';
}

export type HullBuyResult = { ok: true; price: number } | { ok: false; error: string };

/**
 * Buys an unowned hull with credits (same price and save data as the old Shop hull rows) and makes it the current hull.
 * Nothing changes when the hull is already owned, unknown, or too expensive.
 */
export function buyAndSelectHull(model: BuilderModel, id: string): HullBuyResult {
  const r = model.store.buyHull(id);
  if (!r.ok) return { ok: false, error: r.error };
  const sw = model.switchHull(id);
  if (!sw.ok) return { ok: false, error: sw.error };
  return { ok: true, price: r.price };
}
