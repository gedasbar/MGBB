/**
 * The hull ladder: Dart (free, 1 slot) < Twin < Prong < Fan < Shuttle. Layouts live in game/gridUtils.ts, silhouettes in
 * ui/shipArt.ts; this file holds the numbers: prices, firing stats and the ladder order.
 */
export const HULL_ORDER = ['dart', 'twin', 'prong', 'fan', 'shuttle'] as const;
export type HullId = (typeof HULL_ORDER)[number];

/** The hull a fresh save starts with and owns for free. */
export const STARTER_HULL: HullId = 'dart';

/**
 * Shop prices in credits. Basis (npm run balance-wall / balance-econ, G4): with the bare Dart a full-attention bot earns
 * about 16 credits on a tier-1 pass (it destroys ~24% of the wall at one shot a second) and a tier is worth 5% more than
 * the one before, so the first four passes pay about 70: that is the Twin, the first hull. Each hull after it is worth
 * several times more of the gun it unlocks (Twin = 4x the Dart's DPS with two Flat+ slots). Fan and Shuttle used to cost
 * 600 and 0; a save that already owns them keeps them.
 */
export const TWIN_PRICE = 70;
export const PRONG_PRICE = 350;
export const FAN_PRICE = 1200;
export const SHUTTLE_PRICE = 3000;

export const HULL_PRICES: Record<HullId, number> = {
  dart: 0, twin: TWIN_PRICE, prong: PRONG_PRICE, fan: FAN_PRICE, shuttle: SHUTTLE_PRICE,
};

/**
 * Pulse rate of each hull as a share of CONFIG.PULSE.BASE_RATE (4 per second). Chunk 14a: every hull's basic shot deals 1,
 * so the pulse rate is the hull's main stat and climbs the ladder: Dart 2/s, Twin 2.5/s, Prong 4/s, Fan 4/s, Shuttle 5/s.
 * (Before: Dart 1/s, every other hull 4/s; the Prong was then no stronger than the Twin, and the Dart with a Flat+ could
 * not clear tier 1.) Fan and Prong share the rate: the Fan's three ejectors and 72 cells are its step up.
 */
export const DART_FIRE_RATE_MUL = 0.5;
export const TWIN_FIRE_RATE_MUL = 0.625;
export const PRONG_FIRE_RATE_MUL = 1;
export const FAN_FIRE_RATE_MUL = 1;
export const SHUTTLE_FIRE_RATE_MUL = 1.25;

export const HULL_FIRE_RATE_MUL: Record<HullId, number> = {
  dart: DART_FIRE_RATE_MUL, twin: TWIN_FIRE_RATE_MUL, prong: PRONG_FIRE_RATE_MUL, fan: FAN_FIRE_RATE_MUL, shuttle: SHUTTLE_FIRE_RATE_MUL,
};

/** Pulse-rate multiplier of a hull (1 for an unknown id or no id: tests and the debug starter circuit). */
export function fireRateMul(hullId?: string): number {
  return (hullId && (HULL_FIRE_RATE_MUL as Record<string, number>)[hullId]) || 1;
}
